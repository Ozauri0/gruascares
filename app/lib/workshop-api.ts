// Agenda y fichas técnicas del taller contra el backend (rutas /api/mechanic/*, solo mecánico o admin).

import { apiGet, apiPatch, apiPost } from "./api";
import { toAgendaItem } from "./api-adapters";
import type { ApiAgendaItem } from "./api-types";
import type { AppointmentStatus } from "./portal-types";
import type { AgendaItem } from "./workshop-mocks";

export async function fetchAgenda(date: string, signal?: AbortSignal): Promise<AgendaItem[]> {
  const { agenda } = await apiGet<{ agenda: ApiAgendaItem[] }>("/api/mechanic/agenda", { date }, { signal });
  return agenda.map(toAgendaItem);
}

export async function changeAppointmentStatus(id: string, status: AppointmentStatus): Promise<void> {
  await apiPatch(`/api/mechanic/appointments/${encodeURIComponent(id)}/status`, { status });
}

export type ReportInput = { observations: string; mileage: string; parts: string; recommendations: string };

/** Guarda la ficha técnica y finaliza la atención (el backend avisa al cliente por correo la primera vez). */
export async function saveReportAndFinish(id: string, draft: ReportInput): Promise<{ finalized: boolean }> {
  const body = {
    observations: draft.observations.trim(),
    mileageAtService: draft.mileage.trim() === "" ? undefined : Number(draft.mileage),
    partsReplaced: draft.parts.trim() || undefined,
    recommendations: draft.recommendations.trim() || undefined,
    finalize: true,
  };
  const { finalized } = await apiPost<{ finalized: boolean }>(`/api/mechanic/appointments/${encodeURIComponent(id)}/report`, body);
  return { finalized };
}
