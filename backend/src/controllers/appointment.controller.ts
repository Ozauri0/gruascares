import { hasRole } from "../utils/roles.js";
import { Request, Response } from "express";
import { eq, and, ne, sql, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/connection.js";
import { appointments, services, vehicles, users, serviceRecords, blockedDates } from "../db/schema.js";
import { isValidSlotFormat, MAX_CONCURRENT_APPOINTMENTS_PER_SLOT } from "../config/constants.js";
import { sendAppointmentConfirmationEmail } from "../services/email/email.service.js";
import { logAudit } from "../services/audit/audit.service.js";
import { EMAIL_REGEX, MAX_LEN, findTooLong, isUuid } from "../utils/validate.js";
import { isCancellable } from "../domain/appointment-status.js";
import { slotsForDate } from "../utils/slots.js";
import { isSlotPast, isValidIsoDate, todayInSantiago } from "../utils/dates.js";

/**
 * 1. Obtener catálogo de servicios activos para agendamiento
 */
export async function getServicesCatalog(_req: Request, res: Response) {
  try {
    const list = await db
      .select({
        id: services.id,
        category: services.category,
        name: services.name,
        description: services.description,
        basePrice: services.basePrice,
        estimatedDurationMin: services.estimatedDurationMin,
      })
      .from(services)
      .where(eq(services.isActive, true))
      .orderBy(services.category, services.name);

    return res.status(200).json({ services: list });
  } catch (error) {
    console.error("Error en getServicesCatalog:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al obtener catálogo de servicios",
    });
  }
}

/**
 * 2. Consultar bloques horarios y disponibilidad para una fecha
 */
export async function getAvailableSlots(req: Request, res: Response) {
  try {
    const { date } = req.query;

    if (!date || typeof date !== "string") {
      return res.status(400).json({
        error: "Bad Request",
        message: "El parámetro 'date' (YYYY-MM-DD) es obligatorio",
      });
    }

    if (!isValidIsoDate(date)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Fecha inválida. Utilice una fecha real con el formato YYYY-MM-DD",
      });
    }

    // Comprobar que no sea fecha en el pasado (según la fecha de Chile, no la de UTC)
    if (date < todayInSantiago()) {
      return res.status(400).json({
        error: "Bad Request",
        message: "No se puede consultar disponibilidad para fechas pasadas",
      });
    }

    // Consultar citas activas (no canceladas) para la fecha
    const activeBookings = await db
      .select({
        timeSlot: appointments.timeSlot,
        count: sql<number>`count(*)::int`,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.scheduledDate, date),
          ne(appointments.status, "cancelada")
        )
      )
      .groupBy(appointments.timeSlot);

    const bookedMap = new Map(activeBookings.map((b) => [b.timeSlot, b.count]));

    // Consultar bloqueos de fechas y horarios establecidos por administración
    const activeBlocks = await db
      .select()
      .from(blockedDates)
      .where(eq(blockedDates.date, date));

    const isDayBlocked = activeBlocks.some((b) => !b.timeSlot);
    const dayBlockReason = activeBlocks.find((b) => !b.timeSlot)?.reason;
    const blockedSlotsMap = new Map(
      activeBlocks.filter((b) => Boolean(b.timeSlot)).map((b) => [b.timeSlot!, b.reason])
    );

    const daySlots = await slotsForDate(date);
    const slots = daySlots.map((slot) => {
      if (isSlotPast(date, slot)) {
        return {
          time: slot,
          bookedCount: bookedMap.get(slot) || 0,
          capacityRemaining: 0,
          available: false,
          reason: "Horario ya transcurrido",
        };
      }

      if (isDayBlocked) {
        return {
          time: slot,
          bookedCount: 0,
          capacityRemaining: 0,
          available: false,
          reason: dayBlockReason || "Día completo bloqueado para atención",
        };
      }

      const isSlotBlocked = blockedSlotsMap.has(slot);
      const bookedCount = bookedMap.get(slot) || 0;
      const capacityRemaining = isSlotBlocked
        ? 0
        : Math.max(0, MAX_CONCURRENT_APPOINTMENTS_PER_SLOT - bookedCount);

      return {
        time: slot,
        bookedCount,
        capacityRemaining,
        available: !isSlotBlocked && capacityRemaining > 0,
        reason: isSlotBlocked ? blockedSlotsMap.get(slot) : undefined,
      };
    });

    return res.status(200).json({
      date,
      capacityPerSlot: MAX_CONCURRENT_APPOINTMENTS_PER_SLOT,
      slots,
    });
  } catch (error) {
    console.error("Error en getAvailableSlots:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al consultar disponibilidad",
    });
  }
}

/**
 * 3. Crear una nueva cita (agendamiento)
 */
export async function createAppointment(req: Request, res: Response) {
  try {
    const {
      serviceId,
      scheduledDate,
      timeSlot,
      vehicleId,
      location,
      notes,
      name,
      email,
      phone,
    } = req.body;

    // 1. Validaciones básicas
    if (!serviceId || !scheduledDate || !timeSlot) {
      return res.status(400).json({
        error: "Bad Request",
        message: "serviceId, scheduledDate y timeSlot son obligatorios",
      });
    }

    if (!isUuid(serviceId)) {
      return res.status(400).json({ error: "Bad Request", message: "serviceId debe ser un UUID válido" });
    }

    if (vehicleId !== undefined && vehicleId !== null && vehicleId !== "") {
      if (!isUuid(vehicleId)) {
        return res.status(400).json({ error: "Bad Request", message: "vehicleId debe ser un UUID válido" });
      }
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Para asociar un vehículo a la cita debes iniciar sesión",
        });
      }
    }

    const tooLong = findTooLong([
      ["El nombre", name, MAX_LEN.name],
      ["El correo", email, MAX_LEN.email],
      ["El teléfono", phone, MAX_LEN.phone],
      ["La ubicación", location, MAX_LEN.location],
      ["Los detalles", notes, MAX_LEN.notes],
    ]);
    if (tooLong) {
      return res.status(400).json({ error: "Bad Request", message: tooLong });
    }

    if (typeof timeSlot !== "string" || !isValidSlotFormat(timeSlot)) {
      return res.status(400).json({
        error: "Bad Request",
        message: `El horario '${timeSlot}' no es válido. Usa el formato HH:MM`,
      });
    }

    if (!isValidIsoDate(scheduledDate)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "scheduledDate debe ser una fecha real con el formato YYYY-MM-DD",
      });
    }

    if (scheduledDate < todayInSantiago()) {
      return res.status(400).json({
        error: "Bad Request",
        message: "No se puede agendar para una fecha en el pasado",
      });
    }

    const validSlots = await slotsForDate(scheduledDate);
    if (!validSlots.includes(timeSlot)) {
      return res.status(400).json({
        error: "Bad Request",
        message: `El horario '${timeSlot}' no es válido para ese día. Opciones: ${validSlots.join(", ")}`,
      });
    }

    if (isSlotPast(scheduledDate, timeSlot)) {
      return res.status(400).json({
        error: "Bad Request",
        message: `El horario de las ${timeSlot} hrs de hoy ya transcurrió. Elige un horario posterior u otro día.`,
      });
    }

    // 2. Verificar servicio
    const [service] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.isActive, true)))
      .limit(1);

    if (!service) {
      return res.status(404).json({
        error: "Not Found",
        message: "El servicio seleccionado no existe o no se encuentra activo",
      });
    }

    // 3. Determinar titular: usuario autenticado o solicitud de invitado.
    // Una solicitud sin sesión NUNCA se asocia a una cuenta existente ni crea cuentas:
    // queda con los datos de contacto y se vincula si esa persona se registra después.
    const targetUserId: string | null = req.user?.userId ?? null;
    let clientName: string = req.user?.name ?? "";
    let clientEmail: string = req.user?.email ?? "";
    let guest: { name: string; email: string; phone: string | null } | null = null;

    if (!targetUserId) {
      if (typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Para agendar sin sesión iniciada, indica tu nombre (mínimo 2 caracteres)",
        });
      }
      if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Para agendar sin sesión iniciada, indica un correo electrónico válido",
        });
      }
      clientName = name.trim();
      clientEmail = email.toLowerCase().trim();
      guest = { name: clientName, email: clientEmail, phone: phone ? String(phone).trim() : null };
    }

    // 4. Validar vehículo: debe pertenecer al usuario autenticado
    let vehicleInfo: { plate: string; brand: string; model: string } | null = null;
    if (vehicleId) {
      const [veh] = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, targetUserId!)))
        .limit(1);
      if (!veh) {
        return res.status(404).json({
          error: "Not Found",
          message: "El vehículo indicado no existe en tu cuenta",
        });
      }
      vehicleInfo = veh;
    }

    // 5. Verificar bloqueos y cupo e insertar de forma atómica. El candado por (fecha, bloque)
    // serializa las reservas simultáneas del mismo horario: sin él, dos solicitudes paralelas
    // leerían "queda un cupo" y ambas insertarían superando la capacidad.
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`appointment-slot:${scheduledDate}|${timeSlot}`}))`);

      const [blockedRecord] = await tx
        .select()
        .from(blockedDates)
        .where(
          and(
            eq(blockedDates.date, scheduledDate),
            sql`(${blockedDates.timeSlot} is null or ${blockedDates.timeSlot} = ${timeSlot})`
          )
        )
        .limit(1);
      if (blockedRecord) return { kind: "blocked" as const, reason: blockedRecord.reason };

      const [slotUsage] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(appointments)
        .where(
          and(
            eq(appointments.scheduledDate, scheduledDate),
            eq(appointments.timeSlot, timeSlot),
            ne(appointments.status, "cancelada")
          )
        );
      if (slotUsage && slotUsage.count >= MAX_CONCURRENT_APPOINTMENTS_PER_SLOT) {
        return { kind: "full" as const };
      }

      const [created] = await tx
        .insert(appointments)
        .values({
          userId: targetUserId,
          guestName: guest?.name ?? null,
          guestEmail: guest?.email ?? null,
          guestPhone: guest?.phone ?? null,
          vehicleId: vehicleId || null,
          serviceId: service.id,
          scheduledDate,
          timeSlot,
          status: "solicitada",
          location: location ? String(location).trim() : null,
          notes: notes ? String(notes).trim() : null,
        })
        .returning();
      return { kind: "created" as const, appointment: created };
    });

    if (outcome.kind === "blocked") {
      return res.status(409).json({
        error: "Conflict",
        message: `El horario de las ${timeSlot} hrs del ${scheduledDate} no se encuentra disponible: ${outcome.reason}`,
      });
    }
    if (outcome.kind === "full") {
      return res.status(409).json({
        error: "Conflict",
        message: `El horario de las ${timeSlot} hrs ya no tiene cupos disponibles para el ${scheduledDate}. Por favor elija otro horario.`,
      });
    }
    const newAppointment = outcome.appointment;

    // 7. Disparar correo de confirmación de forma asíncrona
    if (clientEmail) {
      sendAppointmentConfirmationEmail(clientEmail, {
        name: clientName,
        serviceName: service.name,
        scheduledDate,
        timeSlot,
        vehiclePlate: vehicleInfo?.plate,
        vehicleBrandModel: vehicleInfo ? `${vehicleInfo.brand} ${vehicleInfo.model}` : undefined,
        status: "solicitada",
        location: location ? String(location).trim() : undefined,
        notes: notes ? String(notes).trim() : undefined,
      });
    }

    // 8. Registrar evento de auditoría
    logAudit({
      userId: targetUserId,
      userEmail: clientEmail,
      action: guest ? "APPOINTMENT_CREATE_GUEST" : "APPOINTMENT_CREATE",
      entityType: "appointment",
      entityId: newAppointment.id,
      details: {
        serviceId: service.id,
        serviceName: service.name,
        scheduledDate,
        timeSlot,
        vehicleId: vehicleId || null,
      },
      req,
    });

    return res.status(201).json({
      message: "Cita agendada exitosamente",
      appointment: {
        ...newAppointment,
        serviceName: service.name,
        serviceCategory: service.category,
      },
    });
  } catch (error) {
    console.error("Error en createAppointment:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al procesar el agendamiento",
    });
  }
}

/**
 * 4. Obtener citas del usuario autenticado (Portal de Usuario)
 */
export async function getMyAppointments(req: Request, res: Response) {
  try {
    const reportMechanic = alias(users, "report_mechanic");
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized", message: "No autenticado" });
    }

    const list = await db
      .select({
        id: appointments.id,
        scheduledDate: appointments.scheduledDate,
        timeSlot: appointments.timeSlot,
        status: appointments.status,
        location: appointments.location,
        notes: appointments.notes,
        createdAt: appointments.createdAt,
        service: {
          id: services.id,
          name: services.name,
          category: services.category,
          basePrice: services.basePrice,
          estimatedDurationMin: services.estimatedDurationMin,
        },
        vehicle: {
          id: vehicles.id,
          plate: vehicles.plate,
          brand: vehicles.brand,
          model: vehicles.model,
          year: vehicles.year,
        },
        report: {
          id: serviceRecords.id,
          observations: serviceRecords.observations,
          partsReplaced: serviceRecords.partsReplaced,
          mileageAtService: serviceRecords.mileageAtService,
          recommendations: serviceRecords.recommendations,
          completedAt: serviceRecords.completedAt,
          mechanicName: reportMechanic.name,
        },
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
      .leftJoin(serviceRecords, eq(appointments.id, serviceRecords.appointmentId))
      .leftJoin(reportMechanic, eq(serviceRecords.mechanicId, reportMechanic.id))
      .where(eq(appointments.userId, req.user.userId))
      .orderBy(desc(appointments.scheduledDate), desc(appointments.timeSlot));

    // Sin informe, el objeto anidado llega con todos los campos nulos: se normaliza a null.
    const appointmentsWithReport = list.map((item) => ({
      ...item,
      report: item.report && item.report.id ? item.report : null,
    }));

    return res.status(200).json({ appointments: appointmentsWithReport });
  } catch (error) {
    console.error("Error en getMyAppointments:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al obtener historial de citas",
    });
  }
}

/**
 * 5. Detalle de una cita por ID
 */
export async function getAppointmentById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({ error: "Bad Request", message: "ID de cita inválido: debe ser un UUID" });
    }

    const [item] = await db
      .select({
        id: appointments.id,
        userId: appointments.userId,
        scheduledDate: appointments.scheduledDate,
        timeSlot: appointments.timeSlot,
        status: appointments.status,
        location: appointments.location,
        notes: appointments.notes,
        createdAt: appointments.createdAt,
        service: {
          id: services.id,
          name: services.name,
          category: services.category,
          basePrice: services.basePrice,
        },
        vehicle: {
          id: vehicles.id,
          plate: vehicles.plate,
          brand: vehicles.brand,
          model: vehicles.model,
        },
        report: {
          observations: serviceRecords.observations,
          partsReplaced: serviceRecords.partsReplaced,
          recommendations: serviceRecords.recommendations,
          completedAt: serviceRecords.completedAt,
        },
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
      .leftJoin(serviceRecords, eq(appointments.id, serviceRecords.appointmentId))
      .where(eq(appointments.id, id))
      .limit(1);

    if (!item) {
      return res.status(404).json({ error: "Not Found", message: "Cita no encontrada" });
    }

    // Validar autorización: si es cliente, debe ser el dueño de la cita
    if (!hasRole(req.user!, "admin", "mecanico") && item.userId !== req.user!.userId) {
      return res.status(403).json({ error: "Forbidden", message: "Acceso no autorizado a esta cita" });
    }

    return res.status(200).json({ appointment: item });
  } catch (error) {
    console.error("Error en getAppointmentById:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al obtener información de la cita",
    });
  }
}

/**
 * 6. Cancelar una cita
 */
export async function cancelAppointment(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({ error: "Bad Request", message: "ID de cita inválido: debe ser un UUID" });
    }

    const [item] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);

    if (!item) {
      return res.status(404).json({ error: "Not Found", message: "Cita no encontrada" });
    }

    if (!hasRole(req.user!, "admin", "mecanico") && item.userId !== req.user!.userId) {
      return res.status(403).json({ error: "Forbidden", message: "No tienes permiso para cancelar esta cita" });
    }

    if (!isCancellable(item.status)) {
      const reasons: Record<string, string> = {
        en_proceso: "El vehículo ya está en taller: comunícate con Grúas Cares para cancelar",
        finalizada: "No se puede cancelar una atención que ya ha sido finalizada",
        cancelada: "La cita ya se encuentra cancelada",
      };
      return res.status(item.status === "finalizada" ? 400 : 409).json({
        error: item.status === "finalizada" ? "Bad Request" : "Conflict",
        message: reasons[item.status] ?? "La cita no se puede cancelar en su estado actual",
      });
    }

    // Cancelación condicionada al estado leído (evita pisar un cambio simultáneo del taller).
    const [updated] = await db
      .update(appointments)
      .set({ status: "cancelada", updatedAt: new Date() })
      .where(and(eq(appointments.id, id), eq(appointments.status, item.status)))
      .returning();

    if (!updated) {
      return res.status(409).json({
        error: "Conflict",
        message: "La cita cambió de estado mientras la cancelabas. Recárgala e inténtalo de nuevo.",
      });
    }

    // Registrar en auditoría
    logAudit({
      userId: req.user?.userId || item.userId,
      userEmail: req.user?.email,
      action: "APPOINTMENT_CANCEL",
      entityType: "appointment",
      entityId: id,
      details: {
        scheduledDate: item.scheduledDate,
        timeSlot: item.timeSlot,
      },
      req,
    });

    return res.status(200).json({
      message: "Cita cancelada exitosamente",
      appointment: updated,
    });
  } catch (error) {
    console.error("Error en cancelAppointment:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al cancelar la cita",
    });
  }
}
