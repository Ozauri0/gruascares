// Flota de grúas de la empresa: cada grúa puede tener un gruero (trabajador sin cuenta) a cargo.
// Rutas /api/cranes (solo jefe de grúas y admin).

import { apiGet, apiPatch, apiPost } from "./api";

/** Tipo de grúa (tabla `crane_types`); la grúa guarda su nombre. El jefe de grúas y el admin agregan tipos nuevos. */
export type CraneType = { id: string; name: string };

export type Crane = {
  id: string;
  name: string;
  plate: string;
  type: string;
  notes: string | null;
  isActive: boolean;
  workerId: string | null;
  workerName: string | null;
};

export type CraneInput = { name: string; plate: string; type: string; notes?: string; workerId?: string | null };

export async function listCranes(signal?: AbortSignal): Promise<Crane[]> {
  const { cranes } = await apiGet<{ cranes: Crane[] }>("/api/cranes", undefined, { signal });
  return cranes;
}

export async function listCraneTypes(signal?: AbortSignal): Promise<CraneType[]> {
  const { types } = await apiGet<{ types: CraneType[] }>("/api/cranes/types", undefined, { signal });
  return types;
}

export async function createCraneType(name: string): Promise<CraneType> {
  const { type } = await apiPost<{ type: CraneType }>("/api/cranes/types", { name });
  return type;
}

export async function createCrane(input: CraneInput): Promise<Crane> {
  const { crane } = await apiPost<{ crane: Crane }>("/api/cranes", input);
  return crane;
}

export async function updateCrane(id: string, changes: Partial<CraneInput> & { isActive?: boolean }): Promise<Crane> {
  const { crane } = await apiPatch<{ crane: Crane }>(`/api/cranes/${encodeURIComponent(id)}`, changes);
  return crane;
}

/** Grúas activas que no tienen a nadie a cargo (para avisar al jefe). */
export function unassignedCount(cranes: Crane[]): number {
  return cranes.filter((crane) => crane.isActive && !crane.workerId).length;
}
