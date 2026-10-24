import { Request, Response } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/connection.js";
import { appointments, serviceRecords, services, users, vehicles, workers } from "../db/schema.js";
import { limits } from "../config/constants.js";
import { APPOINTMENT_STATUSES, type AppointmentStatus } from "../domain/appointment-status.js";
import { logAudit } from "../services/audit/audit.service.js";
import { isValidIsoDate } from "../utils/dates.js";
import { buildXlsx, XLSX_CONTENT_TYPE, type XlsxCell } from "../utils/xlsx.js";

const AREAS = {
  taller: { category: "serviteca", title: "Taller", workerNoun: "Mecánico" },
  grua: { category: "grua", title: "Grúas", workerNoun: "Gruero" },
} as const;

type ReportArea = keyof typeof AREAS;

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  solicitada: "Solicitada",
  confirmada: "Confirmada",
  en_proceso: "En proceso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

const TYPE_LABEL: Record<string, string> = { mecanico: "Mecánico", gruero: "Gruero" };

const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
/** «2026-10-17 14:30» en hora de Chile. */
const when = (date: Date | null | undefined): string => (date ? stamp.format(date).replace(",", "") : "");

/** Formato RUT con puntos y guion (12.345.678-5) para leerlo en la planilla. */
function prettyRut(rut: string | null | undefined): string {
  const m = /^(\d+)-([\dK])$/.exec(rut ?? "");
  return m ? `${m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${m[2]}` : (rut ?? "");
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * GET /api/admin/reports/:area?startDate=&endDate=&status=   (area = taller | grua)
 * Planilla Excel del área para medir el trabajo: quién pidió cada servicio, qué trabajador se encargó y qué jefe de área
 * lo gestionó, con el informe técnico, y una hoja resumen por trabajador. Solo administradores; queda en la auditoría.
 */
export async function downloadAreaReport(req: Request, res: Response) {
  try {
    const area = req.params.area as ReportArea;
    if (!Object.prototype.hasOwnProperty.call(AREAS, area)) {
      return res.status(404).json({ error: "Not Found", message: "El reporte indicado no existe: usa 'taller' o 'grua'" });
    }
    const { startDate, endDate, status } = req.query;
    if (startDate !== undefined && !isValidIsoDate(startDate)) {
      return res.status(400).json({ error: "Bad Request", message: "startDate debe ser una fecha válida YYYY-MM-DD" });
    }
    if (endDate !== undefined && !isValidIsoDate(endDate)) {
      return res.status(400).json({ error: "Bad Request", message: "endDate debe ser una fecha válida YYYY-MM-DD" });
    }
    if (typeof startDate === "string" && typeof endDate === "string" && startDate > endDate) {
      return res.status(400).json({ error: "Bad Request", message: "startDate no puede ser posterior a endDate" });
    }
    if (status !== undefined && !APPOINTMENT_STATUSES.includes(status as AppointmentStatus)) {
      return res.status(400).json({ error: "Bad Request", message: `status debe ser uno de [${APPOINTMENT_STATUSES.join(", ")}]` });
    }
    const cfg = AREAS[area];

    const conditions = [eq(services.category, cfg.category)];
    if (startDate) conditions.push(gte(appointments.scheduledDate, startDate as string));
    if (endDate) conditions.push(lte(appointments.scheduledDate, endDate as string));
    if (status) conditions.push(eq(appointments.status, status as AppointmentStatus));

    const manager = alias(users, "report_manager");
    const author = alias(users, "report_author");
    const data = await db
      .select({
        scheduledDate: appointments.scheduledDate,
        timeSlot: appointments.timeSlot,
        status: appointments.status,
        location: appointments.location,
        notes: appointments.notes,
        requestedAt: appointments.createdAt,
        clientName: users.name,
        clientRut: users.rut,
        clientPhone: users.phone,
        clientEmail: users.email,
        vehiclePlate: vehicles.plate,
        vehicleBrand: vehicles.brand,
        vehicleModel: vehicles.model,
        serviceName: services.name,
        workerId: workers.id,
        workerName: workers.name,
        workerRut: workers.rut,
        workerTypes: workers.types,
        workerActive: workers.isActive,
        managerName: manager.name,
        authorName: author.name,
        reportObservations: serviceRecords.observations,
        reportParts: serviceRecords.partsReplaced,
        reportMileage: serviceRecords.mileageAtService,
        reportRecommendations: serviceRecords.recommendations,
        reportCompletedAt: serviceRecords.completedAt,
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(users, eq(appointments.userId, users.id))
      .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
      .leftJoin(workers, eq(appointments.workerId, workers.id))
      .leftJoin(manager, eq(appointments.managedBy, manager.id))
      .leftJoin(serviceRecords, eq(appointments.id, serviceRecords.appointmentId))
      .leftJoin(author, eq(serviceRecords.authoredBy, author.id))
      .where(and(...conditions))
      .orderBy(asc(appointments.scheduledDate), asc(appointments.timeSlot), asc(appointments.id))
      .limit(limits.exportMaxRows + 1);

    if (data.length > limits.exportMaxRows) {
      return res.status(413).json({
        error: "Payload Too Large",
        message: `El reporte supera ${limits.exportMaxRows} registros. Acota el rango de fechas (startDate/endDate) y vuelve a intentarlo.`,
      });
    }

    // Hoja de servicios: una fila por solicitud.
    const servicesRows: XlsxCell[][] = data.map((r) => [
      r.scheduledDate,
      r.timeSlot,
      STATUS_LABEL[r.status],
      r.serviceName,
      r.clientName ?? "Cliente sin nombre",
      prettyRut(r.clientRut),
      r.clientPhone,
      r.clientEmail ?? "Sin correo",
      r.vehiclePlate,
      [r.vehicleBrand, r.vehicleModel].filter(Boolean).join(" "),
      r.workerName ?? "Sin asignar",
      prettyRut(r.workerRut),
      r.managerName,
      r.location,
      r.notes,
      when(r.requestedAt),
      when(r.reportCompletedAt),
      r.reportObservations,
      r.reportParts,
      r.reportMileage,
      r.reportRecommendations,
      r.authorName,
    ]);

    // Hoja resumen: rendimiento por trabajador (solo cuenta lo que cae en el rango y estado pedidos).
    type Tally = { name: string; rut: string; types: string; active: string; counts: Record<AppointmentStatus, number>; hours: number[] };
    const blank = (): Record<AppointmentStatus, number> => ({ solicitada: 0, confirmada: 0, en_proceso: 0, finalizada: 0, cancelada: 0 });
    const tallies = new Map<string, Tally>();
    for (const r of data) {
      const key = r.workerId ?? "none";
      let t = tallies.get(key);
      if (!t) {
        t = {
          name: r.workerName ?? "Sin trabajador asignado",
          rut: prettyRut(r.workerRut),
          types: (r.workerTypes ?? []).map((x) => TYPE_LABEL[x] ?? x).join(" y "),
          active: r.workerId ? (r.workerActive ? "Activo" : "De baja") : "",
          counts: blank(),
          hours: [],
        };
        tallies.set(key, t);
      }
      t.counts[r.status]++;
      if (r.status === "finalizada" && r.reportCompletedAt) t.hours.push((r.reportCompletedAt.getTime() - r.requestedAt.getTime()) / 3_600_000);
    }
    const mean = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const ordered = [...tallies.values()].sort((a, b) => b.counts.finalizada - a.counts.finalizada || a.name.localeCompare(b.name, "es"));
    const total = (t: Tally) => Object.values(t.counts).reduce((a, b) => a + b, 0);
    const summaryRows: XlsxCell[][] = ordered.map((t) => [
      t.name,
      t.rut,
      t.types,
      t.active,
      total(t),
      t.counts.solicitada,
      t.counts.confirmada,
      t.counts.en_proceso,
      t.counts.finalizada,
      t.counts.cancelada,
      total(t) - t.counts.cancelada > 0 ? round1((t.counts.finalizada / (total(t) - t.counts.cancelada)) * 100) : null,
      mean(t.hours),
    ]);
    const allHours = ordered.flatMap((t) => t.hours);
    summaryRows.push([
      "TOTAL",
      "",
      "",
      "",
      data.length,
      ...(["solicitada", "confirmada", "en_proceso", "finalizada", "cancelada"] as const).map((s) => ordered.reduce((n, t) => n + t.counts[s], 0)),
      data.length - ordered.reduce((n, t) => n + t.counts.cancelada, 0) > 0
        ? round1((ordered.reduce((n, t) => n + t.counts.finalizada, 0) / (data.length - ordered.reduce((n, t) => n + t.counts.cancelada, 0))) * 100)
        : null,
      mean(allHours),
    ]);

    const file = buildXlsx([
      {
        name: `Resumen por ${cfg.workerNoun.toLowerCase()}`,
        columns: [
          { header: cfg.workerNoun, width: 30 },
          { header: "RUT", width: 14 },
          { header: "Tipo", width: 18 },
          { header: "Estado", width: 11 },
          { header: "Servicios", width: 11 },
          { header: "Solicitadas", width: 12 },
          { header: "Confirmadas", width: 12 },
          { header: "En proceso", width: 12 },
          { header: "Finalizadas", width: 12 },
          { header: "Canceladas", width: 12 },
          { header: "% finalizadas (sin canceladas)", width: 17, format: "decimal" },
          { header: "Horas promedio solicitud → finalización", width: 20, format: "decimal" },
        ],
        rows: summaryRows,
      },
      {
        name: `Servicios ${cfg.title.toLowerCase()}`,
        columns: [
          { header: "Fecha", width: 12 },
          { header: "Hora", width: 8 },
          { header: "Estado", width: 12 },
          { header: "Servicio", width: 32 },
          { header: "Cliente (quién pidió)", width: 26 },
          { header: "RUT cliente", width: 14 },
          { header: "Teléfono cliente", width: 16 },
          { header: "Correo cliente", width: 26 },
          { header: "Patente", width: 10 },
          { header: "Vehículo", width: 20 },
          { header: `${cfg.workerNoun} a cargo`, width: 26 },
          { header: `RUT ${cfg.workerNoun.toLowerCase()}`, width: 14 },
          { header: "Jefe de área que gestionó", width: 24 },
          { header: "Ubicación", width: 26 },
          { header: "Nota del cliente", width: 32, format: "wrap" },
          { header: "Solicitada el", width: 17 },
          { header: "Finalizada el", width: 17 },
          { header: "Observaciones técnicas", width: 40, format: "wrap" },
          { header: "Repuestos", width: 28, format: "wrap" },
          { header: "Kilometraje en servicio", width: 14 },
          { header: "Recomendaciones", width: 32, format: "wrap" },
          { header: "Informe redactado por", width: 24 },
        ],
        rows: servicesRows,
      },
    ]);

    logAudit({
      action: "DATA_EXPORT_REPORT",
      entityType: "export",
      details: { area, count: data.length, startDate, endDate, status },
      req,
    });

    const range = [startDate, endDate].filter(Boolean).join("_a_") || "todo";
    res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename="reporte-${area}-${range}.xlsx"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(Buffer.from(file));
  } catch (error) {
    console.error("Error al generar el reporte:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al generar el reporte" });
  }
}
