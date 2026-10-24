// Trabajadores (mecánicos y grueros) sin cuenta: los jefes de taller y de grúas los registran y les asignan las solicitudes.
// Rutas /api/workers (solo jefes de área y admin).

import { apiGet, apiPatch, apiPost } from "./api";
import type { WorkArea } from "./work-areas";

export type WorkerType = "mecanico" | "gruero";

export type Worker = {
  id: string;
  name: string;
  rut: string;
  phone: string | null;
  types: WorkerType[];
  isActive: boolean;
};

export type WorkerInput = { name: string; rut: string; phone?: string; types: WorkerType[] };

/** Tipo de trabajador que atiende cada área. */
export const WORKER_TYPE_FOR_AREA: Record<WorkArea, WorkerType> = { serviteca: "mecanico", grua: "gruero" };

export const WORKER_TYPE_LABEL: Record<WorkerType, string> = { mecanico: "Mecánico", gruero: "Gruero" };

/** Trabajadores de un área (sin área, todos los que puede ver quien consulta). `active` filtra por estado. */
export async function listWorkers(signal?: AbortSignal, area?: WorkArea, active?: boolean): Promise<Worker[]> {
  const query: Record<string, string> = {};
  if (area) query.area = area;
  if (active !== undefined) query.active = String(active);
  const { workers } = await apiGet<{ workers: Worker[] }>("/api/workers", Object.keys(query).length ? query : undefined, { signal });
  return workers;
}

export async function createWorker(input: WorkerInput): Promise<Worker> {
  const { worker } = await apiPost<{ worker: Worker }>("/api/workers", input);
  return worker;
}

export async function updateWorker(id: string, changes: Partial<WorkerInput> & { isActive?: boolean }): Promise<Worker> {
  const { worker } = await apiPatch<{ worker: Worker }>(`/api/workers/${encodeURIComponent(id)}`, changes);
  return worker;
}
