// Estadísticas mensuales de trabajadores (solo administración): GET /api/admin/stats/workers

import { apiGet } from "./api";

export type StatusCounts = { solicitada: number; confirmada: number; en_proceso: number; finalizada: number; cancelada: number; total: number };

export type WorkerStat = {
  id: string;
  name: string;
  rut: string;
  types: ("mecanico" | "gruero")[];
  isActive: boolean;
  serviteca: StatusCounts;
  grua: StatusCounts;
  total: number;
  finalizadas: number;
};

export type WorkerStats = {
  month: string;
  workers: WorkerStat[];
  /** Solicitudes del mes que no tienen trabajador (sin contar las canceladas). */
  unassigned: { serviteca: number; grua: number };
};

export async function fetchWorkerStats(month: string, signal?: AbortSignal): Promise<WorkerStats> {
  return apiGet<WorkerStats>("/api/admin/stats/workers", { month }, { signal });
}

export type StatsView = "todos" | "taller" | "grua";
export type StatsSort = "asignaciones" | "finalizadas" | "nombre";

export type StatRow = { worker: WorkerStat; total: number; finalizadas: number; canceladas: number; serviteca: number; grua: number };

const TYPE_FOR_VIEW = { taller: "mecanico", grua: "gruero" } as const;

/**
 * Filas de la tabla. «Todos» suma las dos áreas de cada trabajador (sin duplicarlo); «Taller» y «Grúas» muestran solo
 * lo de esa área, con quienes son de ese tipo o trabajaron en ella ese mes.
 */
export function buildRows(stats: WorkerStat[], view: StatsView, sort: StatsSort): StatRow[] {
  const rows: StatRow[] = [];
  for (const worker of stats) {
    const parts = view === "todos" ? [worker.serviteca, worker.grua] : view === "taller" ? [worker.serviteca] : [worker.grua];
    const total = parts.reduce((sum, p) => sum + p.total, 0);
    if (view !== "todos" && total === 0 && !worker.types.includes(TYPE_FOR_VIEW[view])) continue;
    rows.push({
      worker,
      total,
      finalizadas: parts.reduce((sum, p) => sum + p.finalizada, 0),
      canceladas: parts.reduce((sum, p) => sum + p.cancelada, 0),
      serviteca: worker.serviteca.total,
      grua: worker.grua.total,
    });
  }
  const byName = (a: StatRow, b: StatRow) => a.worker.name.localeCompare(b.worker.name, "es");
  return rows.sort((a, b) => {
    if (sort === "nombre") return byName(a, b);
    const key = sort === "finalizadas" ? "finalizadas" : "total";
    return b[key] - a[key] || b.total - a.total || byName(a, b);
  });
}

/** Mes anterior o siguiente (YYYY-MM). */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
