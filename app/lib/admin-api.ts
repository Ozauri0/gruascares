// Panel de administración contra el backend (rutas /api/admin/* y /api/mechanic/*; solo admin).

import { apiDelete, apiGet, apiPatch, apiPost, api } from "./api";
import { toAdminMetrics, toAgendaItem } from "./api-adapters";
import type { AdminMetrics, BlockedDay, DaySchedule } from "./admin-types";
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
      { startDate, endDate, page, limit: PAGE_SIZE, area: "todas" },
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

/** Horarios del día (predefinidos + propios) con carga y bloqueos. */
export async function fetchDaySchedule(date: string, signal?: AbortSignal): Promise<DaySchedule> {
  return apiGet<DaySchedule>("/api/admin/schedule", { date }, { signal });
}

/** Bloquea un bloque horario concreto del día. */
export async function blockSlot(date: string, timeSlot: string, reason: string): Promise<void> {
  await apiPost("/api/admin/blocked-dates", { date, timeSlot, reason });
}

/** Crea un horario propio dentro de un día. */
export async function createSlot(date: string, timeSlot: string): Promise<void> {
  await apiPost("/api/admin/time-slots", { date, timeSlot });
}

export async function deleteSlot(id: string): Promise<void> {
  await apiDelete(`/api/admin/time-slots/${encodeURIComponent(id)}`);
}

export type BulkRange = { startDate: string; endDate: string; weekdays: number[] };

/** Bloquea días completos de un rango según el día de la semana (0 = domingo … 6 = sábado). */
export async function bulkBlockDays(range: BulkRange, reason: string) {
  return apiPost<{ created: number; skipped: number; affectedAppointments: number }>("/api/admin/blocked-dates/bulk", { ...range, reason });
}

export async function bulkUnblockDays(range: BulkRange) {
  return apiPost<{ removed: number }>("/api/admin/blocked-dates/bulk-remove", range);
}

/** El taller cambia la fecha u hora de una cita (avisa al cliente por correo). */
export async function rescheduleAppointment(id: string, scheduledDate: string, timeSlot: string): Promise<{ notified: boolean }> {
  return apiPatch<{ notified: boolean }>(`/api/admin/appointments/${encodeURIComponent(id)}/reschedule`, { scheduledDate, timeSlot });
}

export async function unblockDay(id: string): Promise<void> {
  await apiDelete(`/api/admin/blocked-dates/${encodeURIComponent(id)}`);
}

export async function assignWorker(appointmentId: string, workerId: string): Promise<void> {
  await apiPatch(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/assign`, { workerId });
}

/** Contenido editado de la web (solo lo que difiere de los textos originales). */
export async function fetchContent(signal?: AbortSignal): Promise<Record<string, string>> {
  const { content } = await apiGet<{ content: Record<string, string> }>("/api/content", undefined, { signal });
  return content;
}

/** Guarda varios campos; un valor `null` restaura el original. */
export async function saveContent(values: Record<string, string | null>): Promise<void> {
  await api("/api/admin/content", { method: "PUT", body: { values } });
}

export type ContentDraft = { published: Record<string, string>; draft: Record<string, string | null> };

/** Lo publicado y el borrador pendiente de publicar. */
export async function fetchDraft(signal?: AbortSignal): Promise<ContentDraft> {
  return apiGet<ContentDraft>("/api/admin/content/draft", undefined, { signal });
}

/** Guarda cambios en el borrador (no se ven en el sitio hasta publicar); `null` restaura el original. */
export async function saveDraft(values: Record<string, string | null>): Promise<void> {
  await api("/api/admin/content/draft", { method: "PUT", body: { values } });
}

/** Publica todo el borrador en el sitio público. */
export async function publishDraft(): Promise<void> {
  await api("/api/admin/content/publish", { method: "POST" });
}

/** Descarta el borrador; el sitio público no cambia. */
export async function discardDraft(): Promise<void> {
  await api("/api/admin/content/draft", { method: "DELETE" });
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Sube una imagen (PNG, JPG o WebP, máx. 5 MB) y devuelve su ruta pública. */
export async function uploadImage(file: File): Promise<string> {
  if (!UPLOAD_TYPES.includes(file.type)) throw new Error("La imagen debe ser PNG, JPG o WebP.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("La imagen supera los 5 MB.");
  const { url } = await api<{ url: string }>("/api/admin/uploads", { method: "POST", body: file });
  return url;
}
