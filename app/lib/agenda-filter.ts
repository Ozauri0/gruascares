import type { AppointmentStatus } from "./portal-types";

export type AgendaFilter = AppointmentStatus | "todas" | "en_curso";

/** «Todas» deja fuera las canceladas para no ensuciar el feed: se ven solo en su propio filtro. */
export function matchesFilter(status: AppointmentStatus, filter: AgendaFilter): boolean {
  // Vista principal: lo que se está trabajando (aceptadas y en proceso), sin finalizadas ni canceladas.
  if (filter === "en_curso") return status === "confirmada" || status === "en_proceso";
  if (filter === "todas") return status !== "cancelada";
  return status === filter;
}
