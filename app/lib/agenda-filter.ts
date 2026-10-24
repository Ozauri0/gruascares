import type { AppointmentStatus } from "./portal-types";

export type AgendaFilter = AppointmentStatus | "todas";

/** «Todas» deja fuera las canceladas para no ensuciar el feed: se ven solo en su propio filtro. */
export function matchesFilter(status: AppointmentStatus, filter: AgendaFilter): boolean {
  if (filter === "todas") return status !== "cancelada";
  return status === filter;
}
