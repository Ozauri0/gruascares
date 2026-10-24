import { canWorkOn, hasRole, type ServiceCategory } from "../utils/roles.js";
import { findAssignableWorker } from "../utils/workers.js";
import { Request, Response } from "express";
import { eq, and, desc, asc, gte, lte, ne, sql, or, ilike, notInArray } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  appointments,
  users,
  vehicles,
  services,
  serviceRecords,
  blockedDates,
  customTimeSlots,
  auditLogs,
} from "../db/schema.js";
import { logAudit } from "../services/audit/audit.service.js";
import { AUDIT_AREAS, AUDIT_LEVELS, areaCondition, areaOf, labelOf, levelCondition, levelOf, type AuditArea, type AuditLevel } from "../services/audit/areas.js";
import { lockDaysForBlocking, lockSlotForBooking } from "../utils/locks.js";
import { isValidIsoDate, todayInSantiago, weekRange } from "../utils/dates.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { escapeCsvCell } from "../utils/csv.js";
import { isValidSlotFormat, limits, DEFAULT_TIME_SLOTS, MAX_CONCURRENT_APPOINTMENTS_PER_SLOT } from "../config/constants.js";
import { slotsForDate } from "../utils/slots.js";
import { sendAppointmentRescheduledEmail } from "../services/email/email.service.js";
import { isSlotPast } from "../utils/dates.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPOINTMENT_STATUSES = ["solicitada", "confirmada", "en_proceso", "finalizada", "cancelada"] as const;
type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

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
      vendedor: 0,
      grua: 0,
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
    const todayStr = todayInSantiago();
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

    // 7. Semana en curso (lunes a domingo, hora de Chile): total y por categoría, sin canceladas
    const week = weekRange(todayStr);
    const weekByCategoryRaw = await db
      .select({
        category: services.category,
        count: sql<number>`count(*)::int`,
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .where(and(gte(appointments.scheduledDate, week.start), lte(appointments.scheduledDate, week.end), ne(appointments.status, "cancelada")))
      .groupBy(services.category);
    const weekByCategory: Record<string, number> = { grua: 0, serviteca: 0 };
    for (const row of weekByCategoryRaw) weekByCategory[row.category] = row.count;
    const weekTotal = weekByCategory.grua + weekByCategory.serviteca;

    // 8. Vehículos: registrados y atendidos (con al menos una atención finalizada)
    const [vehicleStats] = await db
      .select({
        total: sql<number>`(select count(*) from ${vehicles})::int`,
        served: sql<number>`(select count(distinct ${appointments.vehicleId}) from ${appointments} where ${appointments.status} = 'finalizada' and ${appointments.vehicleId} is not null)::int`,
      })
      .from(sql`(select 1) as one`);

    // 9. Agenda de hoy, en orden de hora
    const todayAgenda = await db
      .select({
        id: appointments.id,
        timeSlot: appointments.timeSlot,
        status: appointments.status,
        serviceName: services.name,
        clientName: sql<string>`coalesce(${users.name}, 'Cliente sin nombre')`,
        vehiclePlate: vehicles.plate,
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(users, eq(appointments.userId, users.id))
      .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
      .where(eq(appointments.scheduledDate, todayStr))
      .orderBy(asc(appointments.timeSlot), asc(appointments.id));

    return res.json({
      appointments: {
        total: totalAppointments,
        byStatus: appointmentsByStatus,
        today: {
          date: todayStr,
          total: totalToday,
          byStatus: todayByStatus,
        },
        week: {
          start: week.start,
          end: week.end,
          total: weekTotal,
          byCategory: weekByCategory,
        },
      },
      vehicles: { total: vehicleStats?.total ?? 0, served: vehicleStats?.served ?? 0 },
      todayAgenda,
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

    if (!isValidIsoDate(date)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El campo 'date' es obligatorio y debe ser una fecha válida con formato YYYY-MM-DD",
      });
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El motivo del bloqueo ('reason') es obligatorio (mínimo 3 caracteres)",
      });
    }

    const cleanSlot = timeSlot && typeof timeSlot === "string" ? timeSlot.trim() : null;

    if (cleanSlot && !(await slotsForDate(date)).includes(cleanSlot)) {
      return res.status(400).json({
        error: "Bad Request",
        message: `El horario '${cleanSlot}' no existe en el día ${date}`,
      });
    }

    // Con el candado del día: una reserva que esté justo ahora en curso termina antes de que se guarde el bloqueo
    // (y las nuevas ven el bloqueo), así ninguna cita entra dentro de un horario recién bloqueado.
    const outcome = await db.transaction(async (tx) => {
      await lockDaysForBlocking(tx, [date]);

      const existing = await tx
        .select({ id: blockedDates.id })
        .from(blockedDates)
        .where(
          cleanSlot
            ? and(eq(blockedDates.date, date), eq(blockedDates.timeSlot, cleanSlot))
            : and(eq(blockedDates.date, date), sql`${blockedDates.timeSlot} is null`)
        )
        .limit(1);
      if (existing.length > 0) return { kind: "exists" as const };

      const [created] = await tx
        .insert(blockedDates)
        .values({ date, timeSlot: cleanSlot, reason: reason.trim(), createdBy: currentUser.userId })
        .returning();
      return { kind: "ok" as const, blocked: created };
    });

    if (outcome.kind === "exists") {
      return res.status(409).json({
        error: "Conflict",
        message: cleanSlot
          ? `El bloque ${cleanSlot} del día ${date} ya se encuentra bloqueado`
          : `El día ${date} completo ya se encuentra bloqueado`,
      });
    }
    const newBlocked = outcome.blocked;

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
    if (isUniqueViolation(error)) {
      return res.status(409).json({
        error: "Conflict",
        message: "Ese bloqueo ya se encuentra registrado",
      });
    }
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
 * GET /api/admin/schedule?date=YYYY-MM-DD
 * Horarios del día (predefinidos + propios) con su carga y bloqueos, para el calendario maestro.
 */
export async function getDaySchedule(req: Request, res: Response) {
  try {
    const date = req.query.date;
    if (!isValidIsoDate(date)) {
      return res.status(400).json({ error: "Bad Request", message: "El parámetro 'date' debe ser una fecha YYYY-MM-DD" });
    }
    const [custom, blocks, booked] = await Promise.all([
      db.select().from(customTimeSlots).where(eq(customTimeSlots.date, date)),
      db.select().from(blockedDates).where(eq(blockedDates.date, date)),
      db
        .select({ timeSlot: appointments.timeSlot, count: sql<number>`count(*)::int` })
        .from(appointments)
        .where(and(eq(appointments.scheduledDate, date), ne(appointments.status, "cancelada")))
        .groupBy(appointments.timeSlot),
    ]);
    const customBySlot = new Map(custom.map((c) => [c.timeSlot, c.id]));
    const bookedBySlot = new Map(booked.map((b) => [b.timeSlot, b.count]));
    const blockBySlot = new Map(blocks.filter((b) => b.timeSlot).map((b) => [b.timeSlot!, b]));
    const times = [...new Set<string>([...DEFAULT_TIME_SLOTS, ...custom.map((c) => c.timeSlot)])].sort();
    return res.json({
      date,
      capacityPerSlot: MAX_CONCURRENT_APPOINTMENTS_PER_SLOT,
      slots: times.map((time) => {
        const block = blockBySlot.get(time);
        return {
          time,
          custom: customBySlot.has(time),
          customId: customBySlot.get(time) ?? null,
          booked: bookedBySlot.get(time) ?? 0,
          block: block ? { id: block.id, reason: block.reason } : null,
        };
      }),
    });
  } catch (error) {
    console.error("Error al consultar los horarios del día:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al consultar los horarios del día" });
  }
}

/**
 * POST /api/admin/time-slots
 * Crea un horario propio dentro de un día (se suma a los predefinidos).
 */
export async function createTimeSlot(req: Request, res: Response) {
  try {
    const { date, timeSlot } = req.body ?? {};
    if (!isValidIsoDate(date)) {
      return res.status(400).json({ error: "Bad Request", message: "El campo 'date' debe ser una fecha válida YYYY-MM-DD" });
    }
    if (date < todayInSantiago()) {
      return res.status(400).json({ error: "Bad Request", message: "No se pueden crear horarios en una fecha pasada" });
    }
    if (!isValidSlotFormat(timeSlot)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El horario debe tener formato HH:MM y estar entre 06:00 y 22:30",
      });
    }
    if ((await slotsForDate(date)).includes(timeSlot)) {
      return res.status(409).json({ error: "Conflict", message: `El horario ${timeSlot} ya existe el ${date}` });
    }
    const [created] = await db
      .insert(customTimeSlots)
      .values({ date, timeSlot, createdBy: req.user!.userId })
      .returning();
    logAudit({
      action: "TIME_SLOT_CREATED",
      entityType: "custom_time_slot",
      entityId: created.id,
      details: { date, timeSlot },
      req,
    });
    return res.status(201).json({ message: "Horario creado", timeSlot: created });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Conflict", message: "Ese horario ya existe en el día" });
    }
    console.error("Error al crear horario:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al crear el horario" });
  }
}

/**
 * DELETE /api/admin/time-slots/:id
 * Elimina un horario propio. No se puede si tiene citas activas (hay que cancelarlas o reasignarlas antes).
 */
export async function deleteTimeSlot(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: "Bad Request", message: "ID de horario inválido: debe ser un UUID" });
    }
    const [existing] = await db.select().from(customTimeSlots).where(eq(customTimeSlots.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: "Not Found", message: "El horario solicitado no existe" });
    }
    // Con el mismo candado que usan las reservas de ese horario: nadie puede agendar entre el conteo y el borrado.
    const outcome = await db.transaction(async (tx) => {
      await lockSlotForBooking(tx, existing.date, existing.timeSlot);
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(appointments)
        .where(
          and(
            eq(appointments.scheduledDate, existing.date),
            eq(appointments.timeSlot, existing.timeSlot),
            ne(appointments.status, "cancelada")
          )
        );
      if (count > 0) return { kind: "busy" as const, count };
      await tx.delete(customTimeSlots).where(eq(customTimeSlots.id, id));
      await tx
        .delete(blockedDates)
        .where(and(eq(blockedDates.date, existing.date), eq(blockedDates.timeSlot, existing.timeSlot)));
      return { kind: "ok" as const };
    });
    if (outcome.kind === "busy") {
      return res.status(409).json({
        error: "Conflict",
        message: `El horario ${existing.timeSlot} tiene ${outcome.count} cita(s) activa(s). Cancélalas o reasígnalas antes de eliminarlo.`,
      });
    }
    logAudit({
      action: "TIME_SLOT_DELETED",
      entityType: "custom_time_slot",
      entityId: id,
      details: { date: existing.date, timeSlot: existing.timeSlot },
      req,
    });
    return res.json({ message: "Horario eliminado", deletedId: id });
  } catch (error) {
    console.error("Error al eliminar horario:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al eliminar el horario" });
  }
}

const MAX_BULK_DAYS = 400;

/** Fechas ISO entre dos días (inclusive) cuyo día de la semana (0 = domingo … 6 = sábado) esté en `weekdays`. */
function datesInRange(startDate: string, endDate: string, weekdays: number[]): string[] {
  const out: string[] = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (let t = Date.parse(`${startDate}T00:00:00Z`); t <= end; t += 86_400_000) {
    const d = new Date(t);
    if (weekdays.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Valida el cuerpo de los bloqueos masivos; devuelve las fechas afectadas o un mensaje de error. */
function parseBulk(body: any): { dates: string[] } | { error: string } {
  const { startDate, endDate, weekdays } = body ?? {};
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) return { error: "startDate y endDate deben ser fechas YYYY-MM-DD" };
  if (endDate < startDate) return { error: "La fecha final no puede ser anterior a la inicial" };
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_BULK_DAYS) return { error: `El rango no puede superar ${MAX_BULK_DAYS} días` };
  if (!Array.isArray(weekdays) || weekdays.length === 0 || !weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return { error: "weekdays debe ser una lista de días de la semana (0 = domingo … 6 = sábado)" };
  }
  return { dates: datesInRange(startDate, endDate, weekdays) };
}

/**
 * POST /api/admin/blocked-dates/bulk
 * Bloquea días completos de un rango según el día de la semana (ej. todos los sábados y domingos del año).
 * Los días ya bloqueados se omiten. Las citas existentes en esos días no se cancelan: se informan.
 */
export async function bulkBlockDates(req: Request, res: Response) {
  try {
    const parsed = parseBulk(req.body);
    if ("error" in parsed) return res.status(400).json({ error: "Bad Request", message: parsed.error });
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 3) {
      return res.status(400).json({ error: "Bad Request", message: "El motivo del bloqueo ('reason') es obligatorio (mínimo 3 caracteres)" });
    }
    const today = todayInSantiago();
    const dates = parsed.dates.filter((d) => d >= today);
    if (dates.length === 0) {
      return res.status(400).json({ error: "Bad Request", message: "No hay días futuros que coincidan con el rango y los días elegidos" });
    }
    const createdBy = req.user!.userId;
    const created = await db.transaction(async (tx) => {
      await lockDaysForBlocking(tx, dates); // espera a las reservas en curso de esos días
      return tx
        .insert(blockedDates)
        .values(dates.map((date) => ({ date, timeSlot: null, reason, createdBy })))
        .onConflictDoNothing()
        .returning({ id: blockedDates.id });
    });
    const [{ count: affected }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(appointments)
      .where(
        and(
          gte(appointments.scheduledDate, dates[0]),
          lte(appointments.scheduledDate, dates[dates.length - 1]),
          sql`${appointments.scheduledDate} in (${sql.join(dates.map((d) => sql`${d}`), sql`, `)})`,
          ne(appointments.status, "cancelada"),
          ne(appointments.status, "finalizada")
        )
      );
    logAudit({
      action: "DATES_BLOCKED_BULK",
      entityType: "blocked_date",
      details: { startDate: req.body.startDate, endDate: req.body.endDate, weekdays: req.body.weekdays, reason, created: created.length },
      req,
    });
    return res.status(201).json({
      message: `${created.length} día(s) bloqueado(s)`,
      created: created.length,
      skipped: dates.length - created.length,
      affectedAppointments: affected,
    });
  } catch (error) {
    console.error("Error en el bloqueo masivo:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al bloquear los días" });
  }
}

/**
 * POST /api/admin/blocked-dates/bulk-remove
 * Desbloquea los días completos de un rango según el día de la semana (no toca bloqueos de un solo horario).
 */
export async function bulkUnblockDates(req: Request, res: Response) {
  try {
    const parsed = parseBulk(req.body);
    if ("error" in parsed) return res.status(400).json({ error: "Bad Request", message: parsed.error });
    if (parsed.dates.length === 0) return res.json({ message: "Sin días que desbloquear", removed: 0 });
    const removed = await db
      .delete(blockedDates)
      .where(
        and(
          sql`${blockedDates.timeSlot} is null`,
          sql`${blockedDates.date} in (${sql.join(parsed.dates.map((d) => sql`${d}`), sql`, `)})`
        )
      )
      .returning({ id: blockedDates.id });
    logAudit({
      action: "DATES_UNBLOCKED_BULK",
      entityType: "blocked_date",
      details: { startDate: req.body.startDate, endDate: req.body.endDate, weekdays: req.body.weekdays, removed: removed.length },
      req,
    });
    return res.json({ message: `${removed.length} día(s) desbloqueado(s)`, removed: removed.length });
  } catch (error) {
    console.error("Error en el desbloqueo masivo:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al desbloquear los días" });
  }
}

/**
 * PATCH /api/admin/appointments/:id/reschedule
 * El taller cambia la fecha u hora de una cita (a pedido del cliente o del mecánico) y avisa al cliente por correo.
 */
export async function rescheduleAppointment(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { scheduledDate, timeSlot } = req.body ?? {};
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: "Bad Request", message: "ID de cita inválido: debe ser un UUID" });
    }
    if (!isValidIsoDate(scheduledDate)) {
      return res.status(400).json({ error: "Bad Request", message: "scheduledDate debe ser una fecha válida YYYY-MM-DD" });
    }
    if (!isValidSlotFormat(timeSlot)) {
      return res.status(400).json({ error: "Bad Request", message: "timeSlot debe tener formato HH:MM" });
    }
    if (scheduledDate < todayInSantiago()) {
      return res.status(400).json({ error: "Bad Request", message: "No se puede mover una cita a una fecha pasada" });
    }
    if (isSlotPast(scheduledDate, timeSlot)) {
      return res.status(400).json({ error: "Bad Request", message: `El horario de las ${timeSlot} hrs de hoy ya transcurrió` });
    }
    const validSlots = await slotsForDate(scheduledDate);
    if (!validSlots.includes(timeSlot)) {
      return res.status(400).json({
        error: "Bad Request",
        message: `El horario '${timeSlot}' no existe el ${scheduledDate}. Opciones: ${validSlots.join(", ")}`,
      });
    }

    const [current] = await db
      .select({
        appointment: appointments,
        clientName: users.name,
        clientEmail: users.email,
        serviceName: services.name,
      })
      .from(appointments)
      .leftJoin(users, eq(appointments.userId, users.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .where(eq(appointments.id, id))
      .limit(1);
    if (!current) return res.status(404).json({ error: "Not Found", message: "La cita solicitada no existe" });
    const before = current.appointment;
    if (before.status !== "solicitada" && before.status !== "confirmada") {
      return res.status(409).json({
        error: "Conflict",
        message: `Solo se puede cambiar el horario de citas solicitadas o confirmadas (esta está ${before.status})`,
      });
    }
    if (before.scheduledDate === scheduledDate && before.timeSlot === timeSlot) {
      return res.status(400).json({ error: "Bad Request", message: "La cita ya tiene esa fecha y hora" });
    }

    const outcome = await db.transaction(async (tx) => {
      await lockSlotForBooking(tx, scheduledDate, timeSlot);
      const [block] = await tx
        .select()
        .from(blockedDates)
        .where(and(eq(blockedDates.date, scheduledDate), sql`(${blockedDates.timeSlot} is null or ${blockedDates.timeSlot} = ${timeSlot})`))
        .limit(1);
      if (block) return { kind: "blocked" as const, reason: block.reason };
      const [usage] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(appointments)
        .where(
          and(
            eq(appointments.scheduledDate, scheduledDate),
            eq(appointments.timeSlot, timeSlot),
            ne(appointments.status, "cancelada")
          )
        );
      if (usage && usage.count >= MAX_CONCURRENT_APPOINTMENTS_PER_SLOT) return { kind: "full" as const };
      // Condicionada a lo leído: si mientras tanto la cancelaron, entró a taller o ya la movieron, no se pisa.
      const [updated] = await tx
        .update(appointments)
        .set({ scheduledDate, timeSlot, updatedAt: new Date() })
        .where(
          and(
            eq(appointments.id, id),
            eq(appointments.status, before.status),
            eq(appointments.scheduledDate, before.scheduledDate),
            eq(appointments.timeSlot, before.timeSlot)
          )
        )
        .returning();
      if (!updated) return { kind: "changed" as const };
      return { kind: "ok" as const, appointment: updated };
    });
    if (outcome.kind === "blocked") {
      return res.status(409).json({ error: "Conflict", message: `Ese horario está bloqueado: ${outcome.reason}` });
    }
    if (outcome.kind === "full") {
      return res.status(409).json({ error: "Conflict", message: `El horario de las ${timeSlot} hrs del ${scheduledDate} ya no tiene cupos` });
    }
    if (outcome.kind === "changed") {
      return res.status(409).json({ error: "Conflict", message: "La cita cambió mientras la reprogramabas. Recárgala e inténtalo de nuevo." });
    }

    logAudit({
      action: "APPOINTMENT_RESCHEDULED",
      entityType: "appointment",
      entityId: id,
      details: { from: `${before.scheduledDate} ${before.timeSlot}`, to: `${scheduledDate} ${timeSlot}` },
      req,
    });

    const to = current.clientEmail;
    if (to) {
      sendAppointmentRescheduledEmail(to, {
        name: current.clientName ?? "cliente",
        serviceName: current.serviceName,
        previousDate: before.scheduledDate,
        previousTimeSlot: before.timeSlot,
        scheduledDate,
        timeSlot,
      });
    }
    return res.json({ message: "Cita reprogramada", appointment: outcome.appointment, notified: Boolean(to) });
  } catch (error) {
    console.error("Error al reprogramar la cita:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al reprogramar la cita" });
  }
}

/**
 * PATCH /api/admin/appointments/:id/assign { workerId }  (y /api/mechanic/appointments/:id/assign)
 * Asigna o cambia el trabajador a cargo de una cita. Lo hace el jefe del área (o el admin); el trabajador debe estar
 * activo y ser del tipo del servicio (mecánico para serviteca, gruero para grúas).
 */
export async function assignAppointmentWorker(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { workerId } = req.body ?? {};

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "ID de cita inválido: debe ser un UUID",
      });
    }

    if (!workerId || typeof workerId !== "string" || !UUID_REGEX.test(workerId)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "workerId debe ser un UUID válido",
      });
    }

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

    // Quien asigna debe ser del área del servicio, y el trabajador del tipo que lo atiende.
    const [svc] = await db.select({ category: services.category }).from(services).where(eq(services.id, existingAppointment.serviceId)).limit(1);
    const category = (svc?.category ?? "serviteca") as ServiceCategory;
    if (!canWorkOn(req.user, category)) {
      return res.status(403).json({ error: "Forbidden", message: "No tienes permiso para gestionar las citas de esta área" });
    }
    const found = await findAssignableWorker(workerId, category);
    if ("error" in found) {
      return res.status(400).json({ error: "Bad Request", message: found.error });
    }
    const worker = found.worker;

    if (existingAppointment.status === "finalizada" || existingAppointment.status === "cancelada") {
      return res.status(409).json({
        error: "Conflict",
        message: "La cita ya está finalizada o cancelada: no se puede cambiar el trabajador",
      });
    }

    const [updatedAppointment] = await db
      .update(appointments)
      .set({
        workerId: worker.id,
        managedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(appointments.id, id), notInArray(appointments.status, ["finalizada", "cancelada"])))
      .returning();

    if (!updatedAppointment) {
      return res.status(409).json({
        error: "Conflict",
        message: "La cita se finalizó o canceló mientras la editabas: no se puede cambiar el trabajador",
      });
    }

    // Auditoría
    logAudit({
      action: "APPOINTMENT_REASSIGNED",
      entityType: "appointment",
      entityId: id,
      details: {
        previousWorkerId: existingAppointment.workerId,
        newWorkerId: worker.id,
        newWorkerName: worker.name,
      },
      req,
    });

    return res.json({
      message: `Cita asignada exitosamente a ${worker.name}`,
      appointment: updatedAppointment,
      worker: {
        id: worker.id,
        name: worker.name,
      },
    });
  } catch (error) {
    console.error("Error al asignar el trabajador:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al asignar el trabajador",
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
    const { action, entityType, userId, startDate, endDate, area, level, q, page = "1", limit = "50" } = req.query;

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
    if (area !== undefined) {
      if (typeof area !== "string" || !AUDIT_AREAS.includes(area as AuditArea)) {
        return res.status(400).json({ error: "Bad Request", message: `area debe ser una de: ${AUDIT_AREAS.join(", ")}` });
      }
      const cond = areaCondition(area as AuditArea);
      if (cond) conditions.push(cond);
    }
    if (level !== undefined) {
      if (typeof level !== "string" || !AUDIT_LEVELS.includes(level as AuditLevel)) {
        return res.status(400).json({ error: "Bad Request", message: `level debe ser una de: ${AUDIT_LEVELS.join(", ")}` });
      }
      const cond = levelCondition(level as AuditLevel);
      if (cond) conditions.push(cond);
      else conditions.push(sql`${auditLogs.action} NOT IN ('SERVER_ERROR', 'LOGIN_FAILED', 'LOGIN_BLOCKED')`);
    }
    if (typeof q === "string" && q.trim()) {
      const term = `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(or(ilike(auditLogs.userEmail, term), ilike(users.name, term), ilike(auditLogs.details, term), ilike(auditLogs.entityId, term))!);
    }
    if (startDate !== undefined) {
      const from = typeof startDate === "string" ? new Date(startDate) : new Date(NaN);
      if (Number.isNaN(from.getTime())) {
        return res.status(400).json({ error: "Bad Request", message: "startDate inválida: usa YYYY-MM-DD o una fecha ISO" });
      }
      conditions.push(gte(auditLogs.createdAt, from));
    }
    if (endDate !== undefined) {
      const to = typeof endDate === "string" ? new Date(endDate) : new Date(NaN);
      if (Number.isNaN(to.getTime())) {
        return res.status(400).json({ error: "Bad Request", message: "endDate inválida: usa YYYY-MM-DD o una fecha ISO" });
      }
      // Una fecha sin hora (YYYY-MM-DD) incluye el día completo.
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDate as string)) to.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(auditLogs.createdAt, to));
    }

    const [totalCountRaw] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const rows = await db
      .select({ log: auditLogs, userName: users.name, userRole: users.role, userExtraRoles: users.extraRoles })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limitNum)
      .offset(offset);

    const logs = rows.map(({ log, userName, userRole, userExtraRoles }) => ({
      ...log,
      area: areaOf(log.action),
      level: levelOf(log.action),
      label: labelOf(log.action),
      userName,
      userRoles: userRole ? [userRole, ...(userExtraRoles ?? [])] : [],
    }));

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

    if (format !== "json" && format !== "csv") {
      return res.status(400).json({ error: "Bad Request", message: "format debe ser 'json' o 'csv'" });
    }
    if (startDate !== undefined && !isValidIsoDate(startDate)) {
      return res.status(400).json({ error: "Bad Request", message: "startDate debe ser una fecha válida YYYY-MM-DD" });
    }
    if (endDate !== undefined && !isValidIsoDate(endDate)) {
      return res.status(400).json({ error: "Bad Request", message: "endDate debe ser una fecha válida YYYY-MM-DD" });
    }
    if (status !== undefined && !APPOINTMENT_STATUSES.includes(status as AppointmentStatus)) {
      return res.status(400).json({
        error: "Bad Request",
        message: `status debe ser uno de [${APPOINTMENT_STATUSES.join(", ")}]`,
      });
    }

    const conditions = [];
    if (startDate) conditions.push(gte(appointments.scheduledDate, startDate as string));
    if (endDate) conditions.push(lte(appointments.scheduledDate, endDate as string));
    if (status) conditions.push(eq(appointments.status, status as AppointmentStatus));

    const data = await db
      .select({
        id: appointments.id,
        scheduledDate: appointments.scheduledDate,
        timeSlot: appointments.timeSlot,
        status: appointments.status,
        location: appointments.location,
        cargoType: appointments.cargoType,
        destination: appointments.destination,
        cargoDetails: appointments.cargoDetails,
        notes: appointments.notes,
        createdAt: appointments.createdAt,
        clientRut: users.rut,
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
      .orderBy(desc(appointments.scheduledDate))
      .limit(limits.exportMaxRows + 1);

    if (data.length > limits.exportMaxRows) {
      return res.status(413).json({
        error: "Payload Too Large",
        message: `La exportación supera ${limits.exportMaxRows} registros. Acota el rango de fechas (startDate/endDate) y vuelve a intentarlo.`,
      });
    }

    // Auditoría del respaldo/exportación
    logAudit({
      action: `DATA_EXPORT_${format.toUpperCase()}`,
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
          .map(escapeCsvCell)
          .join(",")
      );

      const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
      const filename = `atenciones_gruascares_${todayInSantiago()}.csv`;

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
