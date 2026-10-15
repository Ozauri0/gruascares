// Panel de administración contra el backend (rutas /api/admin/* y /api/mechanic/*; solo admin).

import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { toAdminMetrics, toAgendaItem } from "./api-adapters";
import type { AdminMetrics, BlockedDay, StaffMember } from "./admin-types";
import type { ApiAgendaItem, ApiBlockedDate, ApiMetrics } from "./api-types";
import type { AgendaItem } from "./workshop-types";

export async function fetchMetrics(signal?: AbortSignal): Promise<AdminMetrics> {
  return toAdminMetrics(await apiGet<ApiMetrics>("/api/admin/metrics", undefined, { signal }));
}

const PAGE_SIZE = 500;

/** Todas las citas entre dos fechas (inclusive), recorriendo las páginas que haga falta. */
export async function fetchAgendaRange(startDate: string, endDate: string, signal?: AbortSignal): Promise<AgendaItem[]> {
  const items: AgendaItem[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await apiGet<{ total: number; agenda: ApiAgendaItem[] }>(
      "/api/mechanic/agenda",
      { startDate, endDate, page, limit: PAGE_SIZE },
      { signal }
    );
    items.push(...data.agenda.map(toAgendaItem));
    if (items.length >= data.total || data.agenda.length === 0) break;
  }
  return items;
}

/** Bloqueos de día completo (los bloqueos por bloque horario no se gestionan desde esta pantalla). */
export async function listBlockedDays(signal?: AbortSignal): Promise<BlockedDay[]> {
  const { blockedDates } = await apiGet<{ blockedDates: ApiBlockedDate[] }>("/api/admin/blocked-dates", undefined, { signal });
  return blockedDates.filter((b) => b.timeSlot === null).map((b) => ({ id: b.id, date: b.date, reason: b.reason }));
}

export async function blockDay(date: string, reason: string): Promise<BlockedDay> {
  const { blockedDate } = await apiPost<{ blockedDate: ApiBlockedDate }>("/api/admin/blocked-dates", { date, reason });
  return { id: blockedDate.id, date: blockedDate.date, reason: blockedDate.reason };
}

export async function unblockDay(id: string): Promise<void> {
  await apiDelete(`/api/admin/blocked-dates/${encodeURIComponent(id)}`);
}

export async function listStaff(signal?: AbortSignal): Promise<StaffMember[]> {
  const { staff } = await apiGet<{ staff: StaffMember[] }>("/api/mechanic/list", undefined, { signal });
  return staff;
}

export async function assignMechanic(appointmentId: string, mechanicId: string): Promise<void> {
  await apiPatch(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/assign`, { mechanicId });
}
