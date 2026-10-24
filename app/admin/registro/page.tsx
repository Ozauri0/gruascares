"use client";

import { useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import Skeleton from "../../components/Skeleton";
import AdminNav from "../components/AdminNav";
import { formatDetails, type ActivityArea, type ActivityLevel } from "../../lib/activity-api";
import { useActivity } from "../../lib/use-activity";
import Icon, { type IconName } from "../../components/Icon";

const AREAS: { value: ActivityArea | "todas"; label: string; icon?: IconName }[] = [
  { value: "todas", label: "Todo" },
  { value: "taller", label: "Taller", icon: "wrench" },
  { value: "ventas", label: "Ventas", icon: "tag" },
  { value: "administracion", label: "Administración", icon: "shield" },
  { value: "clientes", label: "Clientes", icon: "user" },
  { value: "cuentas", label: "Cuentas y accesos", icon: "key" },
  { value: "sistema", label: "Sistema", icon: "alert" },
];

const LEVELS: { value: ActivityLevel | "todos"; label: string }[] = [
  { value: "todos", label: "Todos los niveles" },
  { value: "warn", label: "Avisos" },
  { value: "error", label: "Errores" },
];

const AREA_NAME: Record<ActivityArea, string> = { taller: "Taller", ventas: "Ventas", administracion: "Administración", clientes: "Clientes", cuentas: "Cuentas", sistema: "Sistema" };
const LEVEL_NAME: Record<ActivityLevel, string> = { info: "Normal", warn: "Aviso", error: "Error" };
const ROLE_NAME: Record<string, string> = { admin: "Administrador", mecanico: "Mecánico", grua: "Grúas", vendedor: "Vendedor", usuario: "Cliente" };

const dateFmt = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });

export default function ActivityLogPage() {
  const [area, setArea] = useState<ActivityArea | "todas">("todas");
  const [level, setLevel] = useState<ActivityLevel | "todos">("todos");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState("");
  const { logs, total, loading, error, hasMore, loadMore, reload } = useActivity({ area, level, q: query, startDate, endDate });

  async function showMore() {
    setMoreLoading(true);
    setMoreError("");
    try {
      await loadMore();
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : "No se pudo cargar más.");
    } finally {
      setMoreLoading(false);
    }
  }

  return (
    <>
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Registro de <em>actividad.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Qué hizo cada persona del equipo en el taller, las ventas y la administración, y los errores del sistema.</p>
          </div>
        </section>

        <div className="portal-stack wrap">
          <AdminNav current="registro" />

          <section aria-label="Registro de actividad">
            <div className="portal-toolbar">
              <div className="portal-toolbar-left">
                <span className="portal-badge-counter">{loading ? "Cargando…" : error ? "No disponible" : `${total} ${total === 1 ? "evento" : "eventos"}`}</span>
              </div>
              <button type="button" className="portal-add" onClick={reload}>Actualizar</button>
            </div>

            <div className="filter-bar">
              <input className="filter-search" type="search" placeholder="Buscar por persona, correo o detalle…" aria-label="Buscar en el registro" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="filter-pills" role="tablist" aria-label="Filtrar por área">
                {AREAS.map((option) => (
                  <button key={option.value} type="button" role="tab" aria-selected={area === option.value} className={area === option.value ? "filter-pill selected" : "filter-pill"} onClick={() => setArea(option.value)}>
                    {option.icon && <Icon name={option.icon} />}{option.label}
                  </button>
                ))}
              </div>
              <div className="filter-pills" role="tablist" aria-label="Filtrar por nivel">
                {LEVELS.map((option) => (
                  <button key={option.value} type="button" role="tab" aria-selected={level === option.value} className={level === option.value ? "filter-pill selected" : "filter-pill"} onClick={() => setLevel(option.value)}>
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="log-dates">
                <label>Desde <input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} /></label>
                <label>Hasta <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} /></label>
              </div>
            </div>

            {loading ? (
              <Skeleton label="Cargando el registro…" rows={6} />
            ) : error ? (
              <div className="portal-empty-card" role="alert">
                <p>{error}</p>
                <button type="button" className="button button-sm" onClick={reload}>Reintentar</button>
              </div>
            ) : logs.length === 0 ? (
              <p className="portal-empty">No hay actividad con esos filtros.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table log-table">
                  <thead>
                    <tr><th>Cuándo</th><th>Quién</th><th>Qué hizo</th><th>Detalle</th></tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const detail = formatDetails(log.details);
                      return (
                        <tr key={log.id} className={`log-row log-${log.level}`}>
                          <td className="log-when">{dateFmt.format(new Date(log.createdAt))}</td>
                          <td>
                            <strong>{log.userName ?? log.userEmail ?? "Sistema"}</strong>
                            {log.userRoles.length > 0 && <span className="cell-sub">{log.userRoles.map((r) => ROLE_NAME[r] ?? r).join(" + ")}</span>}
                          </td>
                          <td>
                            <span className={`log-badge log-badge-${log.level}`}>{log.level === "info" ? AREA_NAME[log.area] : `${LEVEL_NAME[log.level]} · ${AREA_NAME[log.area]}`}</span>
                            <span className="log-label">{log.label}</span>
                          </td>
                          <td className="log-detail">
                            {detail && <span>{detail}</span>}
                            {log.entityId && log.entityType !== "http" && log.area !== "cuentas" && <span className="cell-sub">{log.entityType} · {log.entityId.slice(0, 8)}</span>}
                            {log.entityType === "http" && log.entityId && <span className="cell-sub">{log.entityId}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !error && logs.length > 0 && (
              <p className="table-note">
                {logs.length} de {total} eventos.{" "}
                {hasMore && (
                  <button type="button" className="toggle-btn" disabled={moreLoading} onClick={() => void showMore()}>
                    {moreLoading ? "Cargando…" : "Ver más"}
                  </button>
                )}
                {moreError && <span className="field-error" role="alert"> {moreError}</span>}
              </p>
            )}
          </section>
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
