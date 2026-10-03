import { Request, Response } from "express";
import { eq, and, ne, sql, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db/connection.js";
import { appointments, services, vehicles, users, serviceRecords } from "../db/schema.js";
import { DEFAULT_TIME_SLOTS, MAX_CONCURRENT_APPOINTMENTS_PER_SLOT } from "../config/constants.js";
import { sendAppointmentConfirmationEmail } from "../services/email/email.service.js";

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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Formato de fecha inválido. Utilice el formato YYYY-MM-DD",
      });
    }

    // Comprobar que no sea fecha en el pasado
    const todayStr = new Date().toISOString().slice(0, 10);
    if (date < todayStr) {
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

    const slots = DEFAULT_TIME_SLOTS.map((slot) => {
      const bookedCount = bookedMap.get(slot) || 0;
      const capacityRemaining = Math.max(0, MAX_CONCURRENT_APPOINTMENTS_PER_SLOT - bookedCount);
      return {
        time: slot,
        bookedCount,
        capacityRemaining,
        available: capacityRemaining > 0,
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

    if (!DEFAULT_TIME_SLOTS.includes(timeSlot)) {
      return res.status(400).json({
        error: "Bad Request",
        message: `El horario '${timeSlot}' no es válido. Opciones: ${DEFAULT_TIME_SLOTS.join(", ")}`,
      });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (scheduledDate < todayStr) {
      return res.status(400).json({
        error: "Bad Request",
        message: "No se puede agendar para una fecha en el pasado",
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

    // 3. Determinar usuario (autenticado o creación/búsqueda de cliente)
    let targetUserId = req.user?.userId;
    let clientName = req.user?.name || name;
    let clientEmail = req.user?.email || email;

    if (!targetUserId) {
      if (!name || !email) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Para agendar sin sesión iniciada, debe indicar su nombre y correo electrónico",
        });
      }

      const normalizedEmail = String(email).toLowerCase().trim();
      clientEmail = normalizedEmail;
      clientName = String(name).trim();

      // Buscar si ya existe usuario con este correo
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existingUser) {
        targetUserId = existingUser.id;
      } else {
        // Crear nuevo usuario cliente con password temporal
        const tempPassword = await bcrypt.hash(Math.random().toString(36).slice(-8), 10);
        const [createdUser] = await db
          .insert(users)
          .values({
            name: clientName,
            email: normalizedEmail,
            passwordHash: tempPassword,
            role: "usuario",
            phone: phone ? String(phone).trim() : null,
          })
          .returning();
        targetUserId = createdUser.id;
      }
    }

    // 4. Validar disponibilidad del bloque horario
    const [slotUsage] = await db
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
      return res.status(409).json({
        error: "Conflict",
        message: `El horario de las ${timeSlot} hrs ya no tiene cupos disponibles para el ${scheduledDate}. Por favor elija otro horario.`,
      });
    }

    // 5. Validar vehículo si se especificó
    let vehicleInfo: { plate: string; brand: string; model: string } | null = null;
    if (vehicleId) {
      const [veh] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .limit(1);
      if (veh) vehicleInfo = veh;
    }

    // 6. Insertar cita
    const [newAppointment] = await db
      .insert(appointments)
      .values({
        userId: targetUserId,
        vehicleId: vehicleId || null,
        serviceId: service.id,
        scheduledDate,
        timeSlot,
        status: "solicitada",
        location: location ? String(location).trim() : null,
        notes: notes ? String(notes).trim() : null,
      })
      .returning();

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
        },
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
      .leftJoin(serviceRecords, eq(appointments.id, serviceRecords.appointmentId))
      .where(eq(appointments.userId, req.user.userId))
      .orderBy(desc(appointments.scheduledDate), desc(appointments.timeSlot));

    return res.status(200).json({ appointments: list });
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
    if (req.user?.role === "usuario" && item.userId !== req.user.userId) {
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

    const [item] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);

    if (!item) {
      return res.status(404).json({ error: "Not Found", message: "Cita no encontrada" });
    }

    if (req.user?.role === "usuario" && item.userId !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden", message: "No tienes permiso para cancelar esta cita" });
    }

    if (item.status === "finalizada") {
      return res.status(400).json({
        error: "Bad Request",
        message: "No se puede cancelar una atención que ya ha sido finalizada",
      });
    }

    const [updated] = await db
      .update(appointments)
      .set({ status: "cancelada", updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();

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
