import { Request, Response } from "express";
import { eq, and, desc, asc, gte, lte } from "drizzle-orm";
import { db } from "../db/connection.js";
import { appointments, users, vehicles, services, serviceRecords } from "../db/schema.js";
import { sendServiceCompletedEmail } from "../services/email/email.service.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_STATUSES = ["solicitada", "confirmada", "en_proceso", "finalizada", "cancelada"] as const;
type AppointmentStatus = (typeof VALID_STATUSES)[number];

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
      if (VALID_STATUSES.includes(status as AppointmentStatus)) {
        conditions.push(eq(appointments.status, status as AppointmentStatus));
      } else {
        return res.status(400).json({
          error: "Bad Request",
          message: `Estado inválido. Debe ser uno de [${VALID_STATUSES.join(", ")}]`,
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
        client: {
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
        },
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
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(appointments.scheduledDate), asc(appointments.timeSlot));

    return res.json({
      count: agendaList.length,
      agenda: agendaList,
    });
  } catch (error) {
    console.error("Error al obtener agenda de mecánico:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al consultar la agenda del taller",
    });
  }
}

/**
 * PATCH /api/appointments/:id/status
 * Actualiza el estado de una cita en el flujo de taller (ej. de confirmada a en_proceso o finalizada).
 */
export async function updateAppointmentStatus(req: Request, res: Response) {
  try {
    const currentUser = req.user!;
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "ID de cita inválido: debe ser un UUID",
      });
    }

    const { status, notes, mechanicId } = req.body;

    if (!status || !VALID_STATUSES.includes(status as AppointmentStatus)) {
      return res.status(400).json({
        error: "Bad Request",
        message: `El estado es obligatorio y debe ser uno de: [${VALID_STATUSES.join(", ")}]`,
      });
    }

    // Verificar si la cita existe
    const [existing] = await db
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

    if (!existing) {
      return res.status(404).json({
        error: "Not Found",
        message: "La cita solicitada no existe",
      });
    }

    const updates: Partial<typeof appointments.$inferInsert> = {
      status: status as AppointmentStatus,
      updatedAt: new Date(),
    };

    if (notes !== undefined && typeof notes === "string") {
      updates.notes = notes.trim();
    }

    // Asignación de mecánico:
    // Si viene en el body y el rol es admin/mecanico
    if (mechanicId && UUID_REGEX.test(mechanicId)) {
      updates.mechanicId = mechanicId;
    } else if (status === "en_proceso" && !existing.appointment.mechanicId) {
      // Auto-asignar el mecánico que inicia la atención
      updates.mechanicId = currentUser.userId;
    }

    const [updatedAppointment] = await db
      .update(appointments)
      .set(updates)
      .where(eq(appointments.id, id))
      .returning();

    // Si pasa a finalizada y ya existe una hoja técnica, disparar correo
    if (status === "finalizada") {
      const [existingRecord] = await db
        .select()
        .from(serviceRecords)
        .where(eq(serviceRecords.appointmentId, id))
        .limit(1);

      if (existingRecord && existing.client?.email) {
        const mechanicName = currentUser.name || "Equipo Técnico Grúas Cares";
        const vehiclePlate = existing.vehicle?.plate || "S/P";
        const vehicleInfo = existing.vehicle
          ? `${existing.vehicle.brand} ${existing.vehicle.model}`
          : "Vehículo registrado";

        sendServiceCompletedEmail(existing.client.email, {
          name: existing.client.name,
          serviceName: existing.service?.name || "Servicio Técnico",
          vehiclePlate,
          vehicleInfo,
          mechanicName,
          observations: existingRecord.observations,
          mileageAtService: existingRecord.mileageAtService,
          partsReplaced: existingRecord.partsReplaced,
          recommendations: existingRecord.recommendations,
          completedAt: new Date().toLocaleDateString("es-CL", { dateStyle: "long" }),
        }).catch((err) => console.error("Error al enviar correo en status finalizada:", err));
      }
    }

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
 * Registra o actualiza la hoja de atención técnica en service_records,
 * actualiza el kilometraje del vehículo si corresponde, pasa la cita a 'finalizada'
 * y despacha automáticamente el correo al cliente.
 */
export async function saveTechnicalReport(req: Request, res: Response) {
  try {
    const currentUser = req.user!;
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "ID de cita inválido: debe ser un UUID",
      });
    }

    const {
      observations,
      partsReplaced,
      mileageAtService,
      recommendations,
      finalize = true,
    } = req.body;

    // Validar observaciones técnicas obligatorias
    if (!observations || typeof observations !== "string" || observations.trim().length < 5) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Las observaciones técnicas son obligatorias y deben tener al menos 5 caracteres",
      });
    }

    // Validar kilometraje si se proporciona
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

    // Consultar cita y relaciones
    const [appointmentData] = await db
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

    if (!appointmentData) {
      return res.status(404).json({
        error: "Not Found",
        message: "La cita indicada no existe",
      });
    }

    // Verificar si ya existe reporte para esta cita
    const [existingRecord] = await db
      .select()
      .from(serviceRecords)
      .where(eq(serviceRecords.appointmentId, id))
      .limit(1);

    let reportRecord;

    if (existingRecord) {
      // Actualizar reporte existente
      const [updated] = await db
        .update(serviceRecords)
        .set({
          mechanicId: currentUser.userId,
          observations: observations.trim(),
          partsReplaced: partsReplaced && typeof partsReplaced === "string" ? partsReplaced.trim() : null,
          mileageAtService: parsedMileage,
          recommendations: recommendations && typeof recommendations === "string" ? recommendations.trim() : null,
          completedAt: new Date(),
        })
        .where(eq(serviceRecords.id, existingRecord.id))
        .returning();
      reportRecord = updated;
    } else {
      // Insertar nuevo reporte técnico
      const [created] = await db
        .insert(serviceRecords)
        .values({
          appointmentId: id,
          mechanicId: currentUser.userId,
          observations: observations.trim(),
          partsReplaced: partsReplaced && typeof partsReplaced === "string" ? partsReplaced.trim() : null,
          mileageAtService: parsedMileage,
          recommendations: recommendations && typeof recommendations === "string" ? recommendations.trim() : null,
          completedAt: new Date(),
        })
        .returning();
      reportRecord = created;
    }

    // Si se reportó nuevo kilometraje y hay vehículo asociado, actualizar el odómetro del vehículo
    if (parsedMileage !== null && appointmentData.appointment.vehicleId) {
      await db
        .update(vehicles)
        .set({
          mileage: parsedMileage,
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, appointmentData.appointment.vehicleId));
    }

    // Si finalize es true, marcar la cita como 'finalizada' y asociar el mecánico si faltaba
    let updatedAppointment = appointmentData.appointment;
    if (finalize) {
      const [finalized] = await db
        .update(appointments)
        .set({
          status: "finalizada",
          mechanicId: appointmentData.appointment.mechanicId || currentUser.userId,
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, id))
        .returning();
      updatedAppointment = finalized;
    }

    // Despacho del correo de Hoja de Atención Técnica Finalizada
    if (appointmentData.client?.email) {
      const mechanicName = currentUser.name || "Equipo Técnico Grúas Cares";
      const vehiclePlate = appointmentData.vehicle?.plate || "S/P";
      const vehicleInfo = appointmentData.vehicle
        ? `${appointmentData.vehicle.brand} ${appointmentData.vehicle.model}`
        : "Vehículo registrado";

      sendServiceCompletedEmail(appointmentData.client.email, {
        name: appointmentData.client.name,
        serviceName: appointmentData.service?.name || "Servicio Técnico",
        vehiclePlate,
        vehicleInfo,
        mechanicName,
        observations: observations.trim(),
        mileageAtService: parsedMileage,
        partsReplaced: partsReplaced && typeof partsReplaced === "string" ? partsReplaced.trim() : null,
        recommendations: recommendations && typeof recommendations === "string" ? recommendations.trim() : null,
        completedAt: new Date().toLocaleDateString("es-CL", { dateStyle: "long" }),
      }).catch((err) => console.error("Error al enviar correo de atención finalizada:", err));
    }

    return res.status(existingRecord ? 200 : 201).json({
      message: "Hoja de atención técnica registrada exitosamente",
      report: reportRecord,
      appointment: updatedAppointment,
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
