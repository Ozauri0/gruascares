// Agenda y fichas técnicas del taller y de grúas contra el backend (rutas /api/mechanic/*, solo su jefe de área o admin).

import { apiGet, apiPatch, apiPost } from "./api";
import { toAgendaItem } from "./api-adapters";
import type { ApiAgendaItem } from "./api-types";
import { todayInSantiago } from "./dates";
import type { AppointmentStatus } from "./portal-types";
import type { AgendaItem } from "./workshop-types";
import type { WorkArea } from "./work-areas";

/** Días hacia atrás que se incluyen cuando se ve la agenda completa (atenciones recientes y todo lo que viene). */
const HISTORY_DAYS = 30;

/** Agenda del área: un día concreto, o (sin fecha) todas las citas desde hace un mes en adelante, de cualquier estado. */
export async function fetchAgenda(date?: string, signal?: AbortSignal, today: string = todayInSantiago(), area: WorkArea = "serviteca"): Promise<AgendaItem[]> {
  const query = date ? { date, area } : { startDate: shiftDay(today, -HISTORY_DAYS), limit: 500, area };
  const { agenda } = await apiGet<{ agenda: ApiAgendaItem[] }>("/api/mechanic/agenda", query, { signal });
  return agenda.map(toAgendaItem);
}

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Todas las solicitudes sin confirmar, de cualquier fecha (la más próxima primero). */
export async function fetchPendingRequests(signal?: AbortSignal, area: WorkArea = "serviteca"): Promise<AgendaItem[]> {
  const { agenda } = await apiGet<{ agenda: ApiAgendaItem[] }>("/api/mechanic/agenda", { status: "solicitada", limit: 200, area }, { signal });
  return agenda.map(toAgendaItem);
}

/** Asigna o cambia el trabajador a cargo de una cita que sigue activa (solicitada, confirmada o en curso). */
export async function assignAppointmentWorker(id: string, workerId: string): Promise<void> {
  await apiPatch(`/api/mechanic/appointments/${encodeURIComponent(id)}/assign`, { workerId });
}

export async function changeAppointmentStatus(id: string, status: AppointmentStatus, workerId?: string): Promise<void> {
  await apiPatch(`/api/mechanic/appointments/${encodeURIComponent(id)}/status`, workerId ? { status, workerId } : { status });
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
