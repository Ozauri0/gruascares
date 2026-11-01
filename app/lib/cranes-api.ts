// Flota de grúas de la empresa: cada grúa puede tener un gruero (trabajador sin cuenta) a cargo.
// Rutas /api/cranes (solo jefe de grúas y admin).

import { apiGet, apiPatch, apiPost } from "./api";

export type CraneType = "plataforma" | "camion_grua" | "otro";

export const CRANE_TYPE_LABEL: Record<CraneType, string> = {
  plataforma: "Plataforma hidráulica",
  camion_grua: "Camión grúa",
  otro: "Otro",
};

export type Crane = {
  id: string;
  name: string;
  plate: string;
  type: CraneType;
  notes: string | null;
  isActive: boolean;
  workerId: string | null;
  workerName: string | null;
};

export type CraneInput = { name: string; plate: string; type: CraneType; notes?: string; workerId?: string | null };

export async function listCranes(signal?: AbortSignal): Promise<Crane[]> {
  const { cranes } = await apiGet<{ cranes: Crane[] }>("/api/cranes", undefined, { signal });
  return cranes;
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
