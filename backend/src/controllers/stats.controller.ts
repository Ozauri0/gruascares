import { Request, Response } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { appointments, services, workers } from "../db/schema.js";
import { APPOINTMENT_STATUSES, type AppointmentStatus } from "../domain/appointment-status.js";
import { todayInSantiago } from "../utils/dates.js";

type Counts = Record<AppointmentStatus, number> & { total: number };
const blank = (): Counts => ({ solicitada: 0, confirmada: 0, en_proceso: 0, finalizada: 0, cancelada: 0, total: 0 });

/** Primer y último día (YYYY-MM-DD) de un mes «YYYY-MM». */
function monthBounds(month: string): { from: string; to: string } {
  const [year, mon] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/**
 * GET /api/admin/stats/workers?month=YYYY-MM   (solo admin; sin `month`, el mes actual en hora de Chile)
 * Asignaciones del mes por trabajador y área. Cada trabajador sale una sola vez: quien es mecánico y gruero junta sus
 * atenciones de ambas áreas (`serviteca` y `grua`) y el `total` las suma, así no se pierden ni se duplican.
 * Entrega también a todos los trabajadores activos sin atenciones, y cuántas solicitudes quedaron sin trabajador.
 */
export async function getWorkerStats(req: Request, res: Response) {
  try {
    const raw = req.query.month;
    const month = raw === undefined ? todayInSantiago().slice(0, 7) : raw;
    if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: "Bad Request", message: "month debe tener el formato YYYY-MM" });
    }
    const { from, to } = monthBounds(month);
    const inMonth = and(gte(appointments.scheduledDate, from), lte(appointments.scheduledDate, to));

    const rows = await db
      .select({
        workerId: appointments.workerId,
        category: services.category,
        status: appointments.status,
        count: sql<number>`count(*)::int`,
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .where(inMonth)
      .groupBy(appointments.workerId, services.category, appointments.status);

    const team = await db
      .select({ id: workers.id, name: workers.name, rut: workers.rut, types: workers.types, isActive: workers.isActive })
      .from(workers)
;

    type Entry = { id: string; name: string; rut: string; types: string[]; isActive: boolean; serviteca: Counts; grua: Counts; total: number; finalizadas: number };
    const byWorker = new Map<string, Entry>();
    for (const w of team) {
      if (!w.isActive) continue;
      byWorker.set(w.id, { ...w, serviteca: blank(), grua: blank(), total: 0, finalizadas: 0 });
    }
    // Quien está de baja aparece solo si tuvo atenciones ese mes.
    for (const w of team) {
      if (w.isActive || byWorker.has(w.id)) continue;
      if (rows.some((r) => r.workerId === w.id)) byWorker.set(w.id, { ...w, serviteca: blank(), grua: blank(), total: 0, finalizadas: 0 });
    }

    const unassigned = { serviteca: 0, grua: 0 };
    for (const r of rows) {
      if (!APPOINTMENT_STATUSES.includes(r.status)) continue;
      if (!r.workerId) {
        // Las canceladas sin trabajador no son trabajo pendiente de asignar.
        if (r.status !== "cancelada") unassigned[r.category] += r.count;
        continue;
      }
      const entry = byWorker.get(r.workerId);
      if (!entry) continue;
      const bucket = entry[r.category];
      bucket[r.status] += r.count;
      bucket.total += r.count;
      entry.total += r.count;
      if (r.status === "finalizada") entry.finalizadas += r.count;
    }

    const list = [...byWorker.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));
    return res.status(200).json({ month, from, to, workers: list, unassigned });
  } catch (error) {
    console.error("Error en getWorkerStats:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "No se pudieron calcular las estadísticas" });
  }
}
