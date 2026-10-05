import { Request, Response } from "express";
import { eq, and, desc, asc, sql, count, sum } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  appointments,
  users,
  vehicles,
  services,
  serviceRecords,
  blockedDates,
  auditLogs,
} from "../db/schema.js";
import { logAudit } from "../services/audit/audit.service.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// =========================================================================
// [T1.8] Métricas y Reportes
// =========================================================================

/**
 * GET /api/admin/metrics
 * Provee estadísticas agregadas para el dashboard de administración.
 */
export async function getAdminMetrics(_req: Request, res: Response) {
  try {
    // 1. Citas agrupadas por estado
    const statusCountsRaw = await db
      .select({
        status: appointments.status,
        count: sql<number>`count(*)::int`,
      })
      .from(appointments)
      .groupBy(appointments.status);

    const appointmentsByStatus: Record<string, number> = {
      solicitada: 0,
      confirmada: 0,
      en_proceso: 0,
      finalizada: 0,
      cancelada: 0,
    };
    let totalAppointments = 0;

    for (const row of statusCountsRaw) {
      appointmentsByStatus[row.status] = row.count;
      totalAppointments += row.count;
    }

    // 2. Servicios más demandados (con ingresos generados por citas finalizadas)
    const topServicesRaw = await db
      .select({
        id: services.id,
        name: services.name,
        category: services.category,
        basePrice: services.basePrice,
        totalAppointments: sql<number>`count(${appointments.id})::int`,
        totalRevenue: sql<number>`coalesce(sum(case when ${appointments.status} = 'finalizada' then ${services.basePrice} else 0 end), 0)::int`,
      })
      .from(services)
      .leftJoin(appointments, eq(services.id, appointments.serviceId))
      .groupBy(services.id, services.name, services.category, services.basePrice)
      .orderBy(desc(sql`count(${appointments.id})`))
      .limit(10);

    // 3. Facturación e Ingresos
    const revenueStatsRaw = await db
      .select({
        realizedRevenue: sql<number>`coalesce(sum(case when ${appointments.status} = 'finalizada' then ${services.basePrice} else 0 end), 0)::int`,
        projectedRevenue: sql<number>`coalesce(sum(case when ${appointments.status} in ('confirmada', 'en_proceso') then ${services.basePrice} else 0 end), 0)::int`,
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id));

    const realizedRevenue = revenueStatsRaw[0]?.realizedRevenue || 0;
    const projectedRevenue = revenueStatsRaw[0]?.projectedRevenue || 0;

    // 4. Métricas de Usuarios y Clientes Nuevos
    const userStatsRaw = await db
      .select({
        role: users.role,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .groupBy(users.role);

    const usersByRole: Record<string, number> = {
      admin: 0,
      mecanico: 0,
      usuario: 0,
    };
    let totalUsers = 0;

    for (const row of userStatsRaw) {
      usersByRole[row.role] = row.count;
      totalUsers += row.count;
    }

    // Clientes registrados en los últimos 30 días
    const [recentClientsRaw] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(
        and(
          eq(users.role, "usuario"),
          sql`${users.createdAt} >= now() - interval '30 days'`
        )
      );

    const newClientsLast30Days = recentClientsRaw?.count || 0;

    // 5. Citas agendadas para hoy
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayAppointmentsRaw = await db
      .select({
        status: appointments.status,
        count: sql<number>`count(*)::int`,
      })
      .from(appointments)
      .where(eq(appointments.scheduledDate, todayStr))
      .groupBy(appointments.status);

    const todayByStatus: Record<string, number> = {
      solicitada: 0,
      confirmada: 0,
      en_proceso: 0,
      finalizada: 0,
      cancelada: 0,
    };
    let totalToday = 0;

    for (const row of todayAppointmentsRaw) {
      todayByStatus[row.status] = row.count;
      totalToday += row.count;
    }

    // 6. Distribución por Categoría (Grúas vs Serviteca)
    const categoryDistributionRaw = await db
      .select({
        category: services.category,
        appointmentsCount: sql<number>`count(${appointments.id})::int`,
      })
      .from(services)
      .leftJoin(appointments, eq(services.id, appointments.serviceId))
      .groupBy(services.category);

    const categoryDistribution: Record<string, number> = {
      grua: 0,
      serviteca: 0,
    };
    for (const row of categoryDistributionRaw) {
      categoryDistribution[row.category] = row.appointmentsCount;
    }

    return res.json({
      appointments: {
        total: totalAppointments,
        byStatus: appointmentsByStatus,
        today: {
          date: todayStr,
          total: totalToday,
          byStatus: todayByStatus,
        },
      },
      revenue: {
        realized: realizedRevenue,
        projected: projectedRevenue,
        totalPotential: realizedRevenue + projectedRevenue,
      },
      topServices: topServicesRaw,
      users: {
        total: totalUsers,
        byRole: usersByRole,
        newClientsLast30Days,
      },
      categoryDistribution,
    });
  } catch (error) {
    console.error("Error al calcular métricas de administración:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al generar las métricas del sistema",
    });
  }
}

// =========================================================================
// [T1.9] Gestión de Taller y Horarios
// =========================================================================

/**
 * GET /api/admin/blocked-dates
 * Lista todas las fechas y franjas bloqueadas.
 */
export async function getBlockedDates(_req: Request, res: Response) {
  try {
    const list = await db
      .select({
        id: blockedDates.id,
        date: blockedDates.date,
        timeSlot: blockedDates.timeSlot,
        reason: blockedDates.reason,
        createdAt: blockedDates.createdAt,
        creator: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(blockedDates)
      .leftJoin(users, eq(blockedDates.createdBy, users.id))
      .orderBy(asc(blockedDates.date));

    return res.json({
      count: list.length,
      blockedDates: list,
    });
  } catch (error) {
    console.error("Error al listar fechas bloqueadas:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al consultar las fechas bloqueadas",
    });
  }
}

/**
 * POST /api/admin/blocked-dates
 * Bloquea un día completo o una franja horaria específica para evitar reservas.
 */
export async function createBlockedDate(req: Request, res: Response) {
  try {
    const currentUser = req.user!;
    const { date, timeSlot, reason } = req.body;

    if (!date || typeof date !== "string" || !DATE_REGEX.test(date)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El campo 'date' es obligatorio y debe tener formato YYYY-MM-DD",
      });
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El motivo del bloqueo ('reason') es obligatorio (mínimo 3 caracteres)",
      });
    }

    const cleanSlot = timeSlot && typeof timeSlot === "string" ? timeSlot.trim() : null;

    // Verificar si ya existe este bloqueo
    const existing = await db
      .select({ id: blockedDates.id })
      .from(blockedDates)
      .where(
        cleanSlot
          ? and(eq(blockedDates.date, date), eq(blockedDates.timeSlot, cleanSlot))
          : and(eq(blockedDates.date, date), sql`${blockedDates.timeSlot} is null`)
      )
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({
        error: "Conflict",
        message: cleanSlot
          ? `El bloque ${cleanSlot} del día ${date} ya se encuentra bloqueado`
          : `El día ${date} completo ya se encuentra bloqueado`,
      });
    }

    const [newBlocked] = await db
      .insert(blockedDates)
      .values({
        date,
        timeSlot: cleanSlot,
        reason: reason.trim(),
        createdBy: currentUser.userId,
      })
      .returning();

    // Auditoría
    logAudit({
      action: "DATE_BLOCKED",
      entityType: "blocked_date",
      entityId: newBlocked.id,
      details: { date, timeSlot: cleanSlot, reason: reason.trim() },
      req,
    });

    return res.status(201).json({
      message: "Bloqueo registrado exitosamente",
      blockedDate: newBlocked,
    });
  } catch (error) {
    console.error("Error al registrar bloqueo de fecha:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al crear el bloqueo",
    });
  }
}

/**
 * DELETE /api/admin/blocked-dates/:id
 * Elimina un bloqueo de fecha u horario.
 */
export async function deleteBlockedDate(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "ID de bloqueo inválido: debe ser un UUID",
      });
    }

    const [existing] = await db
      .select()
      .from(blockedDates)
      .where(eq(blockedDates.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        error: "Not Found",
        message: "El bloqueo solicitado no existe",
      });
    }

    await db.delete(blockedDates).where(eq(blockedDates.id, id));

    // Auditoría
    logAudit({
      action: "DATE_UNBLOCKED",
      entityType: "blocked_date",
      entityId: id,
      details: { date: existing.date, timeSlot: existing.timeSlot, reason: existing.reason },
      req,
    });

    return res.json({
      message: "Bloqueo eliminado exitosamente",
      deletedId: id,
    });
  } catch (error) {
    console.error("Error al eliminar bloqueo de fecha:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al eliminar el bloqueo",
    });
  }
}

/**
 * PATCH /api/admin/appointments/:id/assign
 * Reasigna o asigna el mecánico responsable de una cita.
 */
export async function reassignAppointmentMechanic(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { mechanicId } = req.body;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "ID de cita inválido: debe ser un UUID",
      });
    }

    if (!mechanicId || !UUID_REGEX.test(mechanicId)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "mechanicId debe ser un UUID válido",
      });
    }

    // Verificar que el mecánico exista y tenga rol mecanico o admin
    const [mechanic] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, mechanicId))
      .limit(1);

    if (!mechanic) {
      return res.status(404).json({
        error: "Not Found",
        message: "El técnico seleccionado no existe",
      });
    }

    if (mechanic.role !== "mecanico" && mechanic.role !== "admin") {
      return res.status(400).json({
        error: "Bad Request",
        message: "El usuario asignado debe tener rol de mecánico o administrador",
      });
    }

    if (!mechanic.isActive) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El técnico seleccionado no se encuentra activo",
      });
    }

    // Verificar existencia de la cita
    const [existingAppointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);

    if (!existingAppointment) {
      return res.status(404).json({
        error: "Not Found",
        message: "La cita solicitada no existe",
      });
    }

    const [updatedAppointment] = await db
      .update(appointments)
      .set({
        mechanicId,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, id))
      .returning();

    // Auditoría
    logAudit({
      action: "APPOINTMENT_REASSIGNED",
      entityType: "appointment",
      entityId: id,
      details: {
        previousMechanicId: existingAppointment.mechanicId,
        newMechanicId: mechanicId,
        newMechanicName: mechanic.name,
      },
      req,
    });

    return res.json({
      message: `Cita reasignada exitosamente a ${mechanic.name}`,
      appointment: updatedAppointment,
      mechanic: {
        id: mechanic.id,
        name: mechanic.name,
        email: mechanic.email,
      },
    });
  } catch (error) {
    console.error("Error al reasignar mecánico:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al reasignar el técnico",
    });
  }
}

// =========================================================================
// [T1.10] Auditoría, Logs y Respaldo
// =========================================================================

/**
 * GET /api/admin/audit-logs
 * Consulta de registros de auditoría estructurados con filtros y paginación.
 */
export async function getAuditLogs(req: Request, res: Response) {
  try {
    const { action, entityType, userId, startDate, endDate, page = "1", limit = "50" } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];

    if (action && typeof action === "string") {
      conditions.push(eq(auditLogs.action, action));
    }
    if (entityType && typeof entityType === "string") {
      conditions.push(eq(auditLogs.entityType, entityType));
    }
    if (userId && typeof userId === "string" && UUID_REGEX.test(userId)) {
      conditions.push(eq(auditLogs.userId, userId));
    }
    if (startDate && typeof startDate === "string") {
      conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
    }
    if (endDate && typeof endDate === "string") {
      conditions.push(lte(auditLogs.createdAt, new Date(endDate)));
    }

    const [totalCountRaw] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limitNum)
      .offset(offset);

    return res.json({
      total: totalCountRaw?.count || 0,
      page: pageNum,
      limit: limitNum,
      logs,
    });
  } catch (error) {
    console.error("Error al consultar logs de auditoría:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al obtener los logs de auditoría",
    });
  }
}

/**
 * GET /api/admin/export/appointments
 * Exporta el historial de atenciones en formato CSV o JSON para contabilidad y respaldo.
 */
export async function exportAppointments(req: Request, res: Response) {
  try {
    const { format = "json", startDate, endDate, status } = req.query;

    const conditions = [];
    if (startDate && typeof startDate === "string") {
      conditions.push(gte(appointments.scheduledDate, startDate));
    }
    if (endDate && typeof endDate === "string") {
      conditions.push(lte(appointments.scheduledDate, endDate));
    }
    if (status && typeof status === "string") {
      conditions.push(eq(appointments.status, status as any));
    }

    const data = await db
      .select({
        id: appointments.id,
        scheduledDate: appointments.scheduledDate,
        timeSlot: appointments.timeSlot,
        status: appointments.status,
        location: appointments.location,
        notes: appointments.notes,
        createdAt: appointments.createdAt,
        clientName: users.name,
        clientEmail: users.email,
        clientPhone: users.phone,
        vehiclePlate: vehicles.plate,
        vehicleBrand: vehicles.brand,
        vehicleModel: vehicles.model,
        vehicleYear: vehicles.year,
        vehicleMileage: vehicles.mileage,
        serviceName: services.name,
        serviceCategory: services.category,
        servicePrice: services.basePrice,
        reportObservations: serviceRecords.observations,
        reportParts: serviceRecords.partsReplaced,
        reportMileage: serviceRecords.mileageAtService,
        reportRecommendations: serviceRecords.recommendations,
        reportCompletedAt: serviceRecords.completedAt,
      })
      .from(appointments)
      .leftJoin(users, eq(appointments.userId, users.id))
      .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(serviceRecords, eq(appointments.id, serviceRecords.appointmentId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(appointments.scheduledDate));

    // Auditoría del respaldo/exportación
    logAudit({
      action: `DATA_EXPORT_${(format as string).toUpperCase()}`,
      entityType: "export",
      details: { format, count: data.length, startDate, endDate, status },
      req,
    });

    if (format === "csv") {
      // Formato CSV RFC 4180 con UTF-8 BOM
      const headers = [
        "ID_Cita",
        "Fecha",
        "Horario",
        "Estado",
        "Cliente_Nombre",
        "Cliente_Email",
        "Cliente_Telefono",
        "Patente",
        "Vehiculo_Marca",
        "Vehiculo_Modelo",
        "Vehiculo_Anio",
        "Odometro_Actual",
        "Servicio_Nombre",
        "Servicio_Categoria",
        "Precio_Base",
        "Observaciones_Tecnicas",
        "Repuestos_Utilizados",
        "Kilometraje_Servicio",
        "Recomendaciones",
        "Fecha_Completado",
      ];

      function escapeCsv(val: any): string {
        if (val === null || val === undefined) return "";
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }

      const rows = data.map((item) =>
        [
          item.id,
          item.scheduledDate,
          item.timeSlot,
          item.status,
          item.clientName,
          item.clientEmail,
          item.clientPhone,
          item.vehiclePlate,
          item.vehicleBrand,
          item.vehicleModel,
          item.vehicleYear,
          item.vehicleMileage,
          item.serviceName,
          item.serviceCategory,
          item.servicePrice,
          item.reportObservations,
          item.reportParts,
          item.reportMileage,
          item.reportRecommendations,
          item.reportCompletedAt ? new Date(item.reportCompletedAt).toISOString() : "",
        ]
          .map(escapeCsv)
          .join(",")
      );

      const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
      const filename = `atenciones_gruascares_${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(csvContent);
    }

    // Por defecto formato JSON
    return res.json({
      count: data.length,
      exportedAt: new Date().toISOString(),
      appointments: data,
    });
  } catch (error) {
    console.error("Error al exportar atenciones:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al exportar el historial",
    });
  }
}
