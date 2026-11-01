// Reportes Excel de taller y grúas (solo administración): GET /api/admin/reports/:area

export type ReportArea = "taller" | "grua";

/** Enlace de descarga del reporte; las fechas (YYYY-MM-DD) son opcionales y sin ellas se exporta todo. */
export function reportUrl(area: ReportArea, from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set("startDate", from);
  if (to) params.set("endDate", to);
  const query = params.toString();
  return `/api/admin/reports/${area}${query ? `?${query}` : ""}`;
}
