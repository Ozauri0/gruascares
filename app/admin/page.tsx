"use client";

import { useState } from "react";
import InnerFooter from "../components/InnerFooter";
import LogoutButton from "../components/LogoutButton";
import StatusBadge from "../components/StatusBadge";
import { useAdminMetrics } from "../lib/use-admin-metrics";
import { formatPlate } from "../lib/plate";
import { reportUrl } from "../lib/reports";

import AdminNav from "./components/AdminNav";
import WorkerStatsPanel from "./components/WorkerStatsPanel";
import Skeleton from "../components/Skeleton";

// Panel de administración (T2.10): métricas reales de GET /api/admin/metrics.
export default function AdminPage() {
  const { metrics, loading, error, reload } = useAdminMetrics();
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const exportUrl = (format: "csv" | "json") => {
    const params = new URLSearchParams({ format });
    if (exportFrom) params.set("startDate", exportFrom);
    if (exportTo) params.set("endDate", exportTo);
    return `/api/admin/export/appointments?${params.toString()}`;
  };
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const maxCategory = metrics ? Math.max(1, ...metrics.byCategory.map((item) => item.count)) : 1;
  return (
    <>
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Panel de Control</p>
            <h1>Administración <em>general.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Métricas del taller, citas programadas para hoy y gestión global del negocio.</p>
            <LogoutButton />
          </div>
        </section>

        <div className="portal-stack wrap">
          <AdminNav current="resumen" />

          {loading ? (
            <Skeleton label="Cargando métricas del taller…" kpis />
          ) : error || !metrics ? (
            <div className="portal-empty-card" role="alert">
              <p>{error || "No se pudieron cargar las métricas."}</p>
              <button type="button" className="button button-sm" onClick={reload}>Reintentar</button>
            </div>
          ) : (
            <>
              <section className="kpi-grid" aria-label="Indicadores clave">
                <div className="kpi-card kpi-dark"><strong>{metrics.appointmentsToday}</strong><span>Citas hoy</span></div>
                <div className="kpi-card"><strong>{metrics.appointmentsWeek}</strong><span>Citas esta semana</span></div>
                <div className="kpi-card"><strong>{metrics.totalClients}</strong><span>Clientes registrados</span></div>
                <div className="kpi-card"><strong>{metrics.totalVehicles}</strong><span>Vehículos atendidos</span></div>
              </section>

              <div className="admin-split">
                <section aria-label="Demanda por servicio">
                  <div className="portal-row-head">
                    <h2>Servicios más solicitados</h2>
                    <span className="catalog-count">Semana actual</span>
                  </div>
                  <div className="demand-card">
                    {metrics.byCategory.map((item) => (
                      <div className="demand-row" key={item.category}>
                        <div className="demand-label"><strong>{item.label}</strong><span>{item.count} {item.count === 1 ? "cita" : "citas"}</span></div>
                        <div className="demand-track"><div className="demand-fill" style={{ width: `${Math.round((item.count / maxCategory) * 100)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </section>

                <section aria-label="Agenda de hoy">
                  <div className="portal-row-head">
                    <h2>Hoy en el taller</h2>
                    <span className="catalog-count">{metrics.todayAgenda.length} {metrics.todayAgenda.length === 1 ? "atención" : "atenciones"}</span>
                  </div>
                  {metrics.todayAgenda.length === 0 ? (
                    <div className="portal-empty-card"><p>No hay atenciones programadas para hoy.</p></div>
                  ) : (
                    <div className="compact-list">
                      {metrics.todayAgenda.map((item) => (
                        <div className="compact-row" key={item.id}>
                          <span className="compact-time">{item.timeSlot}</span>
                          <strong>{item.serviceName} <small>· {item.clientName}{item.vehiclePlate ? ` · ${formatPlate(item.vehiclePlate)}` : ""}</small></strong>
                          <StatusBadge status={item.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <section className="export-card" aria-label="Respaldo de datos">
                <div>
                  <h2>Respaldo de atenciones</h2>
                  <p>Descarga el historial de citas con cliente, vehículo, servicio e informe técnico para contabilidad o respaldo. Sin fechas, se exporta todo.</p>
                </div>
                <div className="export-fields">
                  <label>Desde<input type="date" value={exportFrom} max={exportTo || undefined} onChange={(e) => setExportFrom(e.target.value)} /></label>
                  <label>Hasta<input type="date" value={exportTo} min={exportFrom || undefined} onChange={(e) => setExportTo(e.target.value)} /></label>
                  <div className="export-actions">
                    <a className="button button-sm" href={exportUrl("csv")} download>Descargar CSV</a>
                    <a className="button button-sm button-secondary" href={exportUrl("json")} download>Descargar JSON</a>
                  </div>
                </div>
              </section>

              <WorkerStatsPanel />

              <section className="export-card" aria-label="Reportes de taller y grúas">
                <div>
                  <h2>Reportes de rendimiento (Excel)</h2>
                  <p>Una planilla por área con cada servicio —quién lo pidió, qué trabajador se encargó, qué jefe lo gestionó y su informe técnico— y una hoja resumen por trabajador para medir su desempeño. Sin fechas, se incluye todo.</p>
                </div>
                <div className="export-fields">
                  <label>Desde<input type="date" value={reportFrom} max={reportTo || undefined} onChange={(e) => setReportFrom(e.target.value)} /></label>
                  <label>Hasta<input type="date" value={reportTo} min={reportFrom || undefined} onChange={(e) => setReportTo(e.target.value)} /></label>
                  <div className="export-actions">
                    <a className="button button-sm" href={reportUrl("taller", reportFrom, reportTo)} download>Reporte de taller</a>
                    <a className="button button-sm" href={reportUrl("grua", reportFrom, reportTo)} download>Reporte de grúas</a>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
