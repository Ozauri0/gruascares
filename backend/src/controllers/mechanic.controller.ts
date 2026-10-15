import { Request, Response } from "express";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { appointments, users, vehicles, services, serviceRecords } from "../db/schema.js";
import { sendServiceCompletedEmail } from "../services/email/email.service.js";
import { MAX_LEN, findTooLong, isUuid } from "../utils/validate.js";
import { logAudit } from "../services/audit/audit.service.js";
import { parsePagination } from "../utils/pagination.js";
import {
  ALLOWED_TRANSITIONS,
  APPOINTMENT_STATUSES,
  canTransition,
  isAppointmentStatus,
  type AppointmentStatus,
} from "../domain/appointment-status.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/mechanic/agenda
 * Agenda del personal técnico con filtros por fecha, rango de fechas, estado y mecánico.
 */
export async function getMechanicAgenda(req: Request, res: Response) {
  try {
    const { date, startDate, endDate, status, mechanicId } = req.query;

    const conditions = [];

    // Filtro por fecha específica
    if (date && typeof date === "string") {
      conditions.push(eq(appointments.scheduledDate, date));
    }

    // Filtro por rango de fechas
    if (startDate && typeof startDate === "string") {
      conditions.push(gte(appointments.scheduledDate, startDate));
    }
    if (endDate && typeof endDate === "string") {
      conditions.push(lte(appointments.scheduledDate, endDate));
    }

    // Filtro por estado
    if (status && typeof status === "string") {
      if (isAppointmentStatus(status)) {
        conditions.push(eq(appointments.status, status as AppointmentStatus));
      } else {
        return res.status(400).json({
          error: "Bad Request",
          message: `Estado inválido. Debe ser uno de [${APPOINTMENT_STATUSES.join(", ")}]`,
        });
      }
    }

    // Filtro por mecánico asignado
    if (mechanicId && typeof mechanicId === "string") {
      if (!UUID_REGEX.test(mechanicId)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "mechanicId debe ser un UUID válido",
        });
      }
      conditions.push(eq(appointments.mechanicId, mechanicId));
    }

    const { page, limit, offset } = parsePagination(req.query, { limit: 200, maxLimit: 500 });
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(appointments).where(where);

    const agendaList = await db
      .select({
        id: appointments.id,
        scheduledDate: appointments.scheduledDate,
        timeSlot: appointments.timeSlot,
        status: appointments.status,
        location: appointments.location,
        notes: appointments.notes,
        createdAt: appointments.createdAt,
        updatedAt: appointments.updatedAt,
        clientId: appointments.userId,
        clientName: sql<string>`coalesce(${users.name}, ${appointments.guestName})`,
        clientEmail: sql<string>`coalesce(${users.email}, ${appointments.guestEmail})`,
        clientPhone: sql<string | null>`coalesce(${users.phone}, ${appointments.guestPhone})`,
        vehicle: {
          id: vehicles.id,
          plate: vehicles.plate,
          brand: vehicles.brand,
          model: vehicles.model,
          year: vehicles.year,
          mileage: vehicles.mileage,
        },
        service: {
          id: services.id,
          category: services.category,
          name: services.name,
          basePrice: services.basePrice,
          estimatedDurationMin: services.estimatedDurationMin,
        },
        report: {
          id: serviceRecords.id,
          observations: serviceRecords.observations,
          partsReplaced: serviceRecords.partsReplaced,
          mileageAtService: serviceRecords.mileageAtService,
          recommendations: serviceRecords.recommendations,
          completedAt: serviceRecords.completedAt,
        },
      })
      .from(appointments)
      .leftJoin(users, eq(appointments.userId, users.id))
      .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(serviceRecords, eq(appointments.id, serviceRecords.appointmentId))
      .where(where)
      .orderBy(asc(appointments.scheduledDate), asc(appointments.timeSlot), asc(appointments.id))
      .limit(limit)
      .offset(offset);

    // El cliente puede ser una cuenta registrada o una solicitud de invitado (datos de contacto en la cita).
    const agenda = agendaList.map(({ clientId, clientName, clientEmail, clientPhone, ...rest }) => ({
      ...rest,
      client: { id: clientId, name: clientName, email: clientEmail, phone: clientPhone, isGuest: clientId === null },
    }));

    return res.json({
      count: agenda.length,
      total,
      page,
      limit,
      agenda,
    });
  } catch (error) {
    console.error("Error al obtener agenda de mecánico:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al consultar la agenda del taller",
    });
  }
}

async function loadAppointmentContext(id: string) {
  const [row] = await db
    .select({
      appointment: appointments,
      client: users,
      service: services,
      vehicle: vehicles,
    })
    .from(appointments)
    .leftJoin(users, eq(appointments.userId, users.id))
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
    .where(eq(appointments.id, id))
    .limit(1);
  return row;
}

type AppointmentContext = NonNullable<Awaited<ReturnType<typeof loadAppointmentContext>>>;

/** Envía al cliente (cuenta o invitado) la hoja de atención finalizada. */
function notifyServiceCompleted(
  ctx: AppointmentContext,
  mechanicName: string,
  report: { observations: string; mileageAtService: number | null; partsReplaced: string | null; recommendations: string | null }
) {
  const to = ctx.client?.email ?? ctx.appointment.guestEmail;
  if (!to) return;
  sendServiceCompletedEmail(to, {
    name: ctx.client?.name ?? ctx.appointment.guestName ?? "Cliente",
    serviceName: ctx.service?.name || "Servicio Técnico",
    vehiclePlate: ctx.vehicle?.plate || "S/P",
    vehicleInfo: ctx.vehicle ? `${ctx.vehicle.brand} ${ctx.vehicle.model}` : "Vehículo registrado",
    mechanicName: mechanicName || "Equipo Técnico Grúas Cares",
    observations: report.observations,
    mileageAtService: report.mileageAtService,
    partsReplaced: report.partsReplaced,
    recommendations: report.recommendations,
    completedAt: new Date().toLocaleDateString("es-CL", { dateStyle: "long" }),
  }).catch((err) => console.error("Error al enviar correo de atención finalizada:", err));
}

const optionalText = (value: unknown): string | null =>
  value && typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * PATCH /api/appointments/:id/status
 * Avanza una cita por el flujo del taller (solicitada → confirmada → en_proceso → finalizada)
 * o la cancela antes de que entre a taller. Las transiciones inválidas responden 409.
 */
export async function updateAppointmentStatus(req: Request, res: Response) {
  try {
    const currentUser = req.user!;
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({ error: "Bad Request", message: "ID de cita inválido: debe ser un UUID" });
    }

    const { status, notes, mechanicId } = req.body ?? {};

    if (!isAppointmentStatus(status)) {
      return res.status(400).json({
        error: "Bad Request",
        message: `El estado es obligatorio y debe ser uno de: [${APPOINTMENT_STATUSES.join(", ")}]`,
      });
    }
    if (mechanicId !== undefined && mechanicId !== null && !isUuid(mechanicId)) {
      return res.status(400).json({ error: "Bad Request", message: "mechanicId debe ser un UUID válido" });
    }
    if (notes !== undefined && typeof notes !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "notes debe ser texto" });
    }
    const tooLong = findTooLong([["Las notas", notes, MAX_LEN.notes]]);
    if (tooLong) {
      return res.status(400).json({ error: "Bad Request", message: tooLong });
    }

    const ctx = await loadAppointmentContext(id);
    if (!ctx) {
      return res.status(404).json({ error: "Not Found", message: "La cita solicitada no existe" });
    }

    const previousStatus = ctx.appointment.status;
    if (!canTransition(previousStatus, status)) {
      const allowed = ALLOWED_TRANSITIONS[previousStatus];
      return res.status(409).json({
        error: "Conflict",
        message: `No se puede pasar una cita de '${previousStatus}' a '${status}'. ${
          allowed.length ? `Transiciones válidas: [${allowed.join(", ")}]` : "Es un estado final."
        }`,
      });
    }

    // Finalizar exige que exista el informe técnico (se registra con POST /:id/report).
    let existingRecord: typeof serviceRecords.$inferSelect | undefined;
    if (status === "finalizada") {
      [existingRecord] = await db.select().from(serviceRecords).where(eq(serviceRecords.appointmentId, id)).limit(1);
      if (!existingRecord) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Registra el informe técnico antes de finalizar la atención",
        });
      }
    }

    // Mecánico asignado: debe ser personal activo (mecánico o admin).
    let assignedMechanicId = ctx.appointment.mechanicId;
    if (mechanicId) {
      const [mechanic] = await db
        .select({ id: users.id, role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, mechanicId))
        .limit(1);
      if (!mechanic || !mechanic.isActive || (mechanic.role !== "mecanico" && mechanic.role !== "admin")) {
        return res.status(400).json({
          error: "Bad Request",
          message: "El mecánico indicado no existe, está inactivo o no tiene rol de taller",
        });
      }
      assignedMechanicId = mechanic.id;
    } else if (status === "en_proceso" && !assignedMechanicId) {
      assignedMechanicId = currentUser.userId; // quien inicia la atención queda asignado
    }

    // Las notas del taller se agregan sin borrar las que dejó el cliente.
    const staffNote = typeof notes === "string" && notes.trim() ? `[Taller] ${notes.trim()}` : null;
    const mergedNotes = staffNote ? [ctx.appointment.notes, staffNote].filter(Boolean).join("\n") : ctx.appointment.notes;

    // Actualización condicionada al estado leído: evita que dos operaciones simultáneas se pisen.
    const [updatedAppointment] = await db
      .update(appointments)
      .set({ status, mechanicId: assignedMechanicId, notes: mergedNotes, updatedAt: new Date() })
      .where(and(eq(appointments.id, id), eq(appointments.status, previousStatus)))
      .returning();

    if (!updatedAppointment) {
      return res.status(409).json({
        error: "Conflict",
        message: "La cita cambió de estado mientras la editabas. Recárgala e inténtalo de nuevo.",
      });
    }

    if (status === "finalizada" && existingRecord) {
      notifyServiceCompleted(ctx, currentUser.name, existingRecord);
    }

    logAudit({
      action: "APPOINTMENT_STATUS_CHANGE",
      entityType: "appointment",
      entityId: id,
      details: { from: previousStatus, to: status, mechanicId: assignedMechanicId },
      req,
    });

    return res.json({
      message: `Estado de la cita actualizado a '${status}' exitosamente`,
      appointment: updatedAppointment,
    });
  } catch (error) {
    console.error("Error al actualizar estado de la cita:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al actualizar el estado de la cita",
    });
  }
}

/**
 * POST /api/appointments/:id/report
 * Registra o corrige la hoja de atención técnica. Solo para citas en taller (en_proceso)
 * o ya finalizadas (corrección). Con `finalize` (por defecto true) finaliza la cita y avisa
 * al cliente por correo una única vez.
 */
export async function saveTechnicalReport(req: Request, res: Response) {
  try {
    const currentUser = req.user!;
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({ error: "Bad Request", message: "ID de cita inválido: debe ser un UUID" });
    }

    const { observations, partsReplaced, mileageAtService, recommendations, finalize } = req.body ?? {};
    const shouldFinalize = finalize !== false;

    const tooLong = findTooLong([
      ["Las observaciones", observations, MAX_LEN.report],
      ["Los repuestos", partsReplaced, MAX_LEN.report],
      ["Las recomendaciones", recommendations, MAX_LEN.report],
    ]);
    if (tooLong) {
      return res.status(400).json({ error: "Bad Request", message: tooLong });
    }

    if (!observations || typeof observations !== "string" || observations.trim().length < 5) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Las observaciones técnicas son obligatorias y deben tener al menos 5 caracteres",
      });
    }

    let parsedMileage: number | null = null;
    if (mileageAtService !== undefined && mileageAtService !== null && mileageAtService !== "") {
      parsedMileage = Number(mileageAtService);
      if (!Number.isInteger(parsedMileage) || parsedMileage < 0) {
        return res.status(400).json({
          error: "Bad Request",
          message: "El kilometraje en servicio debe ser un número entero mayor o igual a 0",
        });
      }
    }

    const ctx = await loadAppointmentContext(id);
    if (!ctx) {
      return res.status(404).json({ error: "Not Found", message: "La cita indicada no existe" });
    }

    const status = ctx.appointment.status;
    if (status !== "en_proceso" && status !== "finalizada") {
      return res.status(409).json({
        error: "Conflict",
        message: `Solo se puede registrar el informe de una cita en taller (en_proceso). Estado actual: '${status}'`,
      });
    }

    const vehicleMileage = ctx.vehicle?.mileage ?? 0;
    if (parsedMileage !== null && ctx.vehicle && parsedMileage < vehicleMileage) {
      return res.status(400).json({
        error: "Bad Request",
        message: `El kilometraje no puede ser menor al ya registrado del vehículo (${vehicleMileage} km)`,
      });
    }

    const reportValues = {
      mechanicId: currentUser.userId,
      observations: observations.trim(),
      partsReplaced: optionalText(partsReplaced),
      mileageAtService: parsedMileage,
      recommendations: optionalText(recommendations),
      completedAt: new Date(),
    };

    const result = await db.transaction(async (tx) => {
      const [existingRecord] = await tx.select().from(serviceRecords).where(eq(serviceRecords.appointmentId, id)).limit(1);

      let report: typeof serviceRecords.$inferSelect;
      if (existingRecord) {
        [report] = await tx.update(serviceRecords).set(reportValues).where(eq(serviceRecords.id, existingRecord.id)).returning();
      } else {
        [report] = await tx.insert(serviceRecords).values({ appointmentId: id, ...reportValues }).returning();
      }

      // El odómetro del vehículo solo puede avanzar.
      if (parsedMileage !== null && ctx.vehicle && parsedMileage > vehicleMileage) {
        await tx.update(vehicles).set({ mileage: parsedMileage, updatedAt: new Date() }).where(eq(vehicles.id, ctx.vehicle.id));
      }

      let appointment = ctx.appointment;
      let finalized = false;
      if (shouldFinalize && status === "en_proceso") {
        const [done] = await tx
          .update(appointments)
          .set({ status: "finalizada", mechanicId: ctx.appointment.mechanicId ?? currentUser.userId, updatedAt: new Date() })
          .where(and(eq(appointments.id, id), eq(appointments.status, "en_proceso")))
          .returning();
        if (done) {
          appointment = done;
          finalized = true;
        }
      }
      return { report, appointment, finalized, created: !existingRecord };
    });

    // Correo solo en la primera finalización (no al corregir un informe ya finalizado).
    if (result.finalized) {
      notifyServiceCompleted(ctx, currentUser.name, result.report);
    }

    logAudit({
      action: result.finalized ? "APPOINTMENT_FINALIZED" : "TECHNICAL_REPORT_SAVED",
      entityType: "appointment",
      entityId: id,
      details: { reportId: result.report.id, created: result.created, finalized: result.finalized },
      req,
    });

    return res.status(result.created ? 201 : 200).json({
      message: "Hoja de atención técnica registrada exitosamente",
      report: result.report,
      appointment: result.appointment,
      finalized: result.finalized,
    });
  } catch (error) {
    console.error("Error al guardar informe técnico:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al guardar el informe técnico",
    });
  }
}

/**
 * GET /api/appointments/:id/report
 * Obtiene la hoja técnica asociada a una cita (cliente dueño, mecánico o admin).
 */
export async function getAppointmentReport(req: Request, res: Response) {
  try {
    const currentUser = req.user!;
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "ID de cita inválido",
      });
    }

    // Verificar cita
    const [appointment] = await db
      .select({
        id: appointments.id,
        userId: appointments.userId,
      })
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);

    if (!appointment) {
      return res.status(404).json({
        error: "Not Found",
        message: "La cita solicitada no existe",
      });
    }

    // Control de acceso: dueño de la cita o personal mecánico/admin
    if (currentUser.role === "usuario" && appointment.userId !== currentUser.userId) {
      return res.status(403).json({
        error: "Forbidden",
        message: "No tienes permiso para ver esta hoja técnica",
      });
    }

    const [report] = await db
      .select({
        id: serviceRecords.id,
        appointmentId: serviceRecords.appointmentId,
        observations: serviceRecords.observations,
        partsReplaced: serviceRecords.partsReplaced,
        mileageAtService: serviceRecords.mileageAtService,
        recommendations: serviceRecords.recommendations,
        completedAt: serviceRecords.completedAt,
        mechanic: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(serviceRecords)
      .leftJoin(users, eq(serviceRecords.mechanicId, users.id))
      .where(eq(serviceRecords.appointmentId, id))
      .limit(1);

    if (!report) {
      return res.status(404).json({
        error: "Not Found",
        message: "Esta cita aún no tiene informe técnico registrado",
      });
    }

    return res.json({ report });
  } catch (error) {
    console.error("Error al consultar informe técnico:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al consultar el informe técnico",
    });
  }
}
