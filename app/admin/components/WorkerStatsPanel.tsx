"use client";

import { useEffect, useMemo, useState } from "react";
import Skeleton from "../../components/Skeleton";
import { todayInSantiago } from "../../lib/dates";
import { formatRut } from "../../lib/rut";
import { buildRows, fetchWorkerStats, shiftMonth, type StatsSort, type StatsView, type WorkerStats } from "../../lib/worker-stats";

const VIEWS: { value: StatsView; label: string }[] = [
  { value: "todos", label: "Todos juntos" },
  { value: "taller", label: "Taller" },
  { value: "grua", label: "Grúas" },
];

const monthFmt = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" });
const prettyMonth = (month: string) => {
  const text = monthFmt.format(new Date(`${month}-01T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Trabajo mensual de los trabajadores de taller y grúas: asignaciones, finalizadas y canceladas, ordenable. */
export default function WorkerStatsPanel() {
  const [month, setMonth] = useState(() => todayInSantiago().slice(0, 7));
  const [view, setView] = useState<StatsView>("todos");
  const [sort, setSort] = useState<StatsSort>("asignaciones");
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchWorkerStats(month, controller.signal)
      .then(setStats)
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setStats(null);
        setError(err instanceof Error ? err.message : "No se pudieron cargar las estadísticas.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [month, nonce]);

  const rows = useMemo(() => (stats ? buildRows(stats.workers, view, sort) : []), [stats, view, sort]);
  const currentMonth = todayInSantiago().slice(0, 7);
  const unassigned = stats ? (view === "taller" ? stats.unassigned.serviteca : view === "grua" ? stats.unassigned.grua : stats.unassigned.serviteca + stats.unassigned.grua) : 0;

  return (
    <section className="export-card worker-stats" aria-label="Estadísticas de trabajadores">
      <div className="worker-stats-head">
        <div>
          <h2>Trabajo de mecánicos y grueros</h2>
          <p>Asignaciones del mes por trabajador. Quien es mecánico y gruero aparece una sola vez con sus dos áreas sumadas.</p>
        </div>
        <div className="export-fields">
          <div className="export-actions" role="group" aria-label="Mes">
            <button type="button" className="toggle-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior">←</button>
            <strong className="worker-stats-month">{prettyMonth(month)}</strong>
            <button type="button" className="toggle-btn" disabled={month >= currentMonth} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente">→</button>
          </div>
          <label>Ordenar por
            <select value={sort} onChange={(e) => setSort(e.target.value as StatsSort)}>
              <option value="asignaciones">Más asignaciones</option>
              <option value="finalizadas">Más finalizadas</option>
              <option value="nombre">Nombre</option>
            </select>
          </label>
        </div>
      </div>

      <div className="filter-pills" role="tablist" aria-label="Área">
        {VIEWS.map((option) => (
          <button key={option.value} type="button" role="tab" aria-selected={view === option.value} className={view === option.value ? "filter-pill selected" : "filter-pill"} onClick={() => setView(option.value)}>
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton label="Cargando estadísticas…" rows={3} />
      ) : error ? (
        <div className="portal-empty-card" role="alert">
          <p>{error}</p>
          <button type="button" className="button button-sm" onClick={() => setNonce((n) => n + 1)}>Reintentar</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="portal-empty">No hay trabajadores registrados para esta vista.</p>
      ) : (
        <div className="table-scroll worker-stats-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Asignaciones</th>
                {view === "todos" && <><th>Taller</th><th>Grúas</th></>}
                <th>Finalizadas</th>
                <th>Canceladas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.worker.id} className={row.worker.isActive ? "" : "row-inactive"}>
                  <td>
                    <strong>{row.worker.name}</strong>{!row.worker.isActive && " (de baja)"}
                    <br /><span className="cell-sub">{formatRut(row.worker.rut)} · {row.worker.types.map((t) => (t === "mecanico" ? "Mecánico" : "Gruero")).join(" y ")}</span>
                  </td>
                  <td><strong>{row.total}</strong></td>
                  {view === "todos" && <><td>{row.serviteca}</td><td>{row.grua}</td></>}
                  <td>{row.finalizadas}</td>
                  <td>{row.canceladas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {stats && !loading && !error && unassigned > 0 && (
        <p className="portal-subtext">{unassigned} {unassigned === 1 ? "solicitud" : "solicitudes"} de {prettyMonth(month).toLowerCase()} aún sin trabajador asignado.</p>
      )}
    </section>
  );
}
