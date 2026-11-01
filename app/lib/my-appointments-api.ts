// Citas del cliente contra el backend (GET /api/appointments/my, PATCH /api/appointments/:id/cancel).

import { apiGet, apiPatch } from "./api";
import { toPortalAppointment, toPortalReportOrNull } from "./api-adapters";
import type { ApiMyAppointment } from "./api-types";
import type { AppointmentStatus, PortalAppointment, PortalReport } from "./portal-types";

export type PortalItem = { appointment: PortalAppointment; report: PortalReport | null };

export const ACTIVE_STATUSES: AppointmentStatus[] = ["solicitada", "confirmada", "en_proceso"];
/** El cliente solo puede cancelar antes de que el vehículo entre a taller. */
export const CANCELLABLE_STATUSES: AppointmentStatus[] = ["solicitada", "confirmada"];

export async function listMyAppointments(): Promise<PortalItem[]> {
  const { appointments } = await apiGet<{ appointments: ApiMyAppointment[] }>("/api/appointments/my");
  return appointments.map((item) => ({ appointment: toPortalAppointment(item), report: toPortalReportOrNull(item) }));
}

export async function cancelMyAppointment(id: string): Promise<void> {
  await apiPatch(`/api/appointments/${encodeURIComponent(id)}/cancel`);
}

const byDateTime = (a: PortalAppointment, b: PortalAppointment) => `${a.scheduledDate} ${a.timeSlot}`.localeCompare(`${b.scheduledDate} ${b.timeSlot}`);

/** Activas por fecha ascendente (la próxima primero); historial por fecha descendente. */
export function splitAppointments(items: PortalItem[]): { active: PortalItem[]; history: PortalItem[] } {
  const active = items.filter((i) => ACTIVE_STATUSES.includes(i.appointment.status)).sort((a, b) => byDateTime(a.appointment, b.appointment));
  const history = items.filter((i) => !ACTIVE_STATUSES.includes(i.appointment.status)).sort((a, b) => byDateTime(b.appointment, a.appointment));
  return { active, history };
}
