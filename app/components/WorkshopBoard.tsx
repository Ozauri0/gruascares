"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import InnerFooter from "./InnerFooter";
import AreaNav from "./AreaNav";
import LogoutButton from "./LogoutButton";
import StatusBadge from "./StatusBadge";
import { todayInSantiago } from "../lib/dates";
import { matchesFilter, type AgendaFilter } from "../lib/agenda-filter";
import { formatRut, whatsappUrl } from "../lib/rut";
import { useAgenda } from "../lib/use-agenda";
import { usePendingRequests } from "../lib/use-pending-requests";
import { assignAppointmentWorker, changeAppointmentStatus, saveReportAndFinish } from "../lib/workshop-api";
import { listWorkers, type Worker } from "../lib/workers-api";
import WorkersPanel from "./WorkersPanel";
import type { AgendaItem } from "../lib/workshop-types";
import type { AppointmentStatus } from "../lib/portal-types";
import type { WorkArea } from "../lib/work-areas";
import { WORK_AREAS } from "../lib/work-areas";
import Skeleton from "./Skeleton";
import Icon from "./Icon";

const NEXT_STATUS: Partial<Record<AppointmentStatus, { to: AppointmentStatus; label: string }>> = {
  solicitada: { to: "confirmada", label: "Confirmar cita" },
  confirmada: { to: "en_proceso", label: "Iniciar atención" },
};

const dayFmt = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const prettyDay = (iso: string) => {
  const text = dayFmt.format(new Date(`${iso}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
};

type ReportDraft = { mileage: string; observations: string; parts: string; recommendations: string };

function ClientContactLine({ item }: { item: AgendaItem }) {
  const wa = whatsappUrl(item.clientPhone);
  return (
    <>
      <p>
        <Icon name="user" />
        <b>Cliente:</b> {item.clientName}
        {item.clientRut ? ` (${formatRut(item.clientRut)})` : ""}
        {item.clientPhone && (
          <>
            {" · "}
            <Icon name="phone" />
            <a href={`tel:${item.clientPhone}`}>{item.clientPhone}</a>
          </>
        )}
      </p>
      {item.clientPhone && (
        <div className="contact-actions">
          <a className="toggle-btn" href={`tel:${item.clientPhone}`}>Llamar</a>
          {wa && (
            <a className="toggle-btn" href={wa} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          )}
        </div>
      )}
      {!item.clientEmail && (
        <p className="portal-meta">
          <span className="role-badge role-vendedor">Sin correo · contactar por teléfono o WhatsApp</span>
        </p>
      )}
    </>
  );
}

/** Panel de un área de trabajo: solicitudes por confirmar arriba y agenda de todos los días (serviteca o grúas). */
export default function WorkshopBoard({ area }: { area: WorkArea }) {
  const copy = WORK_AREAS[area];
  const FILTERS: { value: AgendaFilter; label: string }[] = [
    { value: "todas", label: "Todas" },
    { value: "confirmada", label: "Confirmadas" },
    { value: "en_proceso", label: copy.inProgressLabel },
    { value: "finalizada", label: "Finalizadas" },
    { value: "cancelada", label: "Canceladas" },
  ];
  const { agenda, loading, error, reload } = useAgenda("", area); // todos los días
  const pending = usePendingRequests(area);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerChoice, setWorkerChoice] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [filter, setFilter] = useState<AgendaFilter>("todas");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReportDraft>({ mileage: "", observations: "", parts: "", recommendations: "" });
  const [draftError, setDraftError] = useState("");
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  // Las solicitudes sin confirmar se atienden arriba; aquí va el resto de la agenda.
  const scheduled = agenda.filter((item) => item.status !== "solicitada");
  const visible = scheduled
    .filter((item) => matchesFilter(item.status, filter))
    .sort((a, b) => a.date.localeCompare(b.date) || a.timeSlot.localeCompare(b.timeSlot));

  // Citas agrupadas por día, para ver de un vistazo qué días y horarios tienen atención.
  const days = visible.reduce<{ date: string; items: AgendaItem[] }[]>((groups, item) => {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
    return groups;
  }, []);
  const todayIso = todayInSantiago();
  const dayTitle = (iso: string) => (iso === todayIso ? `Hoy · ${prettyDay(iso)}` : prettyDay(iso));

  const current = agenda.find((item) => item.id === openId);

  // Trabajadores activos del área, para el selector de quién se encarga.
  const reloadWorkers = useCallback(() => {
    const controller = new AbortController();
    listWorkers(controller.signal, area, true).then(setWorkers).catch(() => setWorkers([]));
    return () => controller.abort();
  }, [area]);
  useEffect(() => reloadWorkers(), [reloadWorkers]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  function openSheet(item: AgendaItem) {
    setDraft({ mileage: "", observations: "", parts: "", recommendations: "" });
    setDraftError("");
    setActionError("");
    setFinishedId(null);
    setConfirmCancel(false);
    setWorkerChoice(item.workerId ?? "");
    setOpenId(item.id);
  }

  /** Confirma o cancela una solicitud de cualquier fecha desde la lista de pendientes. */
  async function decide(item: AgendaItem, to: "confirmada" | "cancelada") {
    if (decidingId) return;
    setDecidingId(item.id);
    setPendingError("");
    try {
      await changeAppointmentStatus(item.id, to);
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : "No se pudo actualizar la solicitud.");
    } finally {
      setConfirmCancelId(null);
      setDecidingId(null);
      pending.reload(); // también si falló: otra persona del taller pudo resolverla antes
      reload();
    }
  }

  async function cancel(item: AgendaItem) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await changeAppointmentStatus(item.id, "cancelada");
      setOpenId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo cancelar la cita.");
    } finally {
      setBusy(false);
      setConfirmCancel(false);
      reload();
      pending.reload();
    }
  }

  async function saveWorker(item: AgendaItem) {
    if (busy || !workerChoice || workerChoice === item.workerId) return;
    setBusy(true);
    setActionError("");
    try {
      await assignAppointmentWorker(item.id, workerChoice);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo asignar al trabajador.");
    } finally {
      setBusy(false);
      reload();
      pending.reload();
    }
  }

  async function advance(item: AgendaItem) {
    const next = NEXT_STATUS[item.status];
    if (!next || busy) return;
    // Para iniciar la atención hay que decir quién la hace (el trabajador elegido en la ficha, o el ya asignado).
    const chosen = workerChoice && workerChoice !== item.workerId ? workerChoice : undefined;
    if (next.to === "en_proceso" && !item.workerId && !chosen) {
      setActionError(copy.needWorker);
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await changeAppointmentStatus(item.id, next.to, chosen);
      reload();
      pending.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo actualizar la cita.");
      reload(); // el estado pudo cambiar por otra persona del taller
    } finally {
      setBusy(false);
    }
  }

  async function finish(item: AgendaItem) {
    if (busy) return;
    if (draft.observations.trim().length < 5) {
      setDraftError("Describe las observaciones técnicas (mínimo 5 caracteres).");
      return;
    }
    if (draft.mileage.trim() !== "") {
      const mileage = Number(draft.mileage);
      if (!Number.isInteger(mileage) || mileage < 0) {
        setDraftError("Kilometraje inválido.");
        return;
      }
    }
    setBusy(true);
    setDraftError("");
    try {
      await saveReportAndFinish(item.id, {
        observations: draft.observations,
        mileage: draft.mileage,
        parts: draft.parts,
        recommendations: draft.recommendations,
      });
      setFinishedId(item.id);
      reload();
      pending.reload();
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "No se pudo guardar la ficha técnica.");
    } finally {
      setBusy(false);
    }
  }

  function set(field: keyof ReportDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.titleLead} <em>{copy.titleEm}</em></h1>
          </div>
          <div>
            <LogoutButton />
          </div>
        </section>

        <div className="portal-stack wrap">
          <AreaNav />

          <section className="pending-requests" aria-label="Solicitudes por confirmar">
            <div className="portal-toolbar">
              <div className="portal-toolbar-left">
                <h2 className="pending-title">Solicitudes por confirmar</h2>
                <span className="portal-badge-counter">{pending.loading ? "Cargando…" : pending.error ? "No disponible" : `${pending.items.length} ${pending.items.length === 1 ? "solicitud" : "solicitudes"}`}</span>
              </div>
              <Link className="portal-add" href="/atencion-presencial">+ Atención presencial por RUT</Link>
            </div>
            <p className="portal-subtext">{copy.pendingHint}</p>
            {pendingError && <p className="field-error" role="alert">{pendingError}</p>}
            {pending.loading ? (
              <Skeleton label="Cargando solicitudes…" rows={2} />
            ) : pending.error ? (
              <div className="portal-empty-card" role="alert">
                <p>{pending.error}</p>
                <button type="button" className="button button-sm" onClick={pending.reload}>Reintentar</button>
              </div>
            ) : pending.items.length === 0 ? (
              <p className="portal-empty">No hay solicitudes por confirmar.</p>
            ) : (
              <div className="portal-appointments pending-list">
                {pending.items.map((item) => {
                  const overdue = item.date < todayInSantiago();
                  const working = decidingId === item.id;
                  return (
                    <article className={`portal-card workshop-card pending-card${overdue ? " overdue" : ""}`} key={item.id}>
                      <div className="portal-card-top">
                        <span className="pending-when"><Icon name="calendar" />{prettyDay(item.date)}</span>
                        <span className="portal-slot"><Icon name="clock" />{item.timeSlot} hrs</span>
                      </div>
                      {overdue && <p className="pending-overdue"><Icon name="alert" />La fecha ya pasó: confírmala solo si se atendió o cancélala.</p>}
                      <h3>{item.serviceName}</h3>
                      <div className="mechanic-card-details">
                        <ClientContactLine item={item} />
                        <p><Icon name="car" /><b>Vehículo:</b> {item.vehicleLabel} · Patente <span className="badge-plate">{item.vehiclePlate}</span></p>
                        {item.notes && <p className="portal-note-box"><Icon name="note" /><b>Nota del cliente:</b> {item.notes}</p>}
                        <p className="portal-meta"><Icon name="wrench" /><b>{copy.assigneeLabel}:</b> {item.workerName ?? "Sin asignar"}</p>
                      </div>
                      <div className="vehicle-actions mechanic-actions pending-actions">
                        <button type="button" className="button-accent" disabled={!!decidingId} onClick={() => void decide(item, "confirmada")}>
                          {working ? "Guardando…" : <><Icon name="check" />Confirmar cita</>}
                        </button>
                        <button type="button" className="toggle-btn" disabled={!!decidingId} onClick={() => openSheet(item)}><Icon name="clipboard" />{copy.sheetButton}</button>
                        {confirmCancelId === item.id ? (
                          <>
                            <button type="button" className="toggle-btn danger" disabled={!!decidingId} onClick={() => void decide(item, "cancelada")}>Sí, cancelar</button>
                            <button type="button" className="toggle-btn" disabled={!!decidingId} onClick={() => setConfirmCancelId(null)}>No</button>
                          </>
                        ) : (
                          <button type="button" className="toggle-btn" disabled={!!decidingId} onClick={() => setConfirmCancelId(item.id)}><Icon name="x" />Cancelar</button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-label={copy.agendaAria} className="workshop-layout">
            <aside className="workshop-side">
              <div className="workshop-filters" role="tablist" aria-label="Filtrar por estado">
                {FILTERS.map((option) => {
                  const count = scheduled.filter((item) => matchesFilter(item.status, option.value)).length;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={filter === option.value}
                      className={filter === option.value ? "workshop-filter selected" : "workshop-filter"}
                      onClick={() => setFilter(option.value)}
                    >
                      <span>{option.label}</span>
                      <b>{count}</b>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="workshop-main">
              {loading ? (
                <Skeleton label={`Cargando ${copy.agendaLoading}…`} />
              ) : error ? (
                <div className="portal-empty-card" role="alert">
                  <p>{error}</p>
                  <button type="button" className="button button-sm" onClick={reload}>Reintentar</button>
                </div>
              ) : visible.length === 0 ? (
                <div className="portal-empty-card">
                  <p>No hay citas con ese filtro.</p>
                  <button type="button" className="button button-sm" onClick={() => setFilter("todas")}>
                    Ver todas las citas
                  </button>
                </div>
              ) : (
                <div className="workshop-days">
                  {days.map((day) => (
                    <section className="workshop-day" key={day.date} aria-label={dayTitle(day.date)}>
                      <h3 className="workshop-day-title">
                        <Icon name="calendar" />{dayTitle(day.date)}
                        <span className="workshop-day-count">{day.items.length} {day.items.length === 1 ? "cita" : "citas"}</span>
                      </h3>
                      <div className="portal-appointments workshop-list">
                        {day.items.map((item) => (
                          <article className="portal-card workshop-card" key={item.id}>
                            <div className="portal-card-top">
                              <StatusBadge status={item.status} />
                              <span className="portal-slot"><Icon name="clock" />{item.timeSlot} hrs</span>
                            </div>
                            <h3>{item.serviceName}</h3>
                            <div className="mechanic-card-details">
                              <ClientContactLine item={item} />
                              <p><Icon name="car" /><b>Vehículo:</b> {item.vehicleLabel} · Patente <span className="badge-plate">{item.vehiclePlate}</span></p>
                              {item.notes && <p className="portal-note-box"><Icon name="note" /><b>Nota del cliente:</b> {item.notes}</p>}
                              <p className="portal-meta"><Icon name="wrench" /><b>Asignado a:</b> {item.workerName ?? copy.unassigned}</p>
                            </div>
                            <div className="vehicle-actions mechanic-actions">
                              <button type="button" className="button-accent" onClick={() => openSheet(item)}>
                                <Icon name="clipboard" />Abrir ficha técnica & opciones <span>→</span>
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </section>

          <WorkersPanel area={area} onChange={reloadWorkers} />
        </div>
      </main>
      <InnerFooter />

      {current && (
        <div className="modal-overlay" onClick={() => setOpenId(null)}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            aria-label={copy.sheetAria}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2>Ficha de Atención</h2>
                <span className="modal-subtitle">Patente {current.vehiclePlate} · {current.serviceName}</span>
              </div>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setOpenId(null)}>×</button>
            </div>
            {finishedId === current.id ? (
              <div className="success modal-success">
                <span><Icon name="check" bare /></span>
                <h3>Atención finalizada con éxito</h3>
                <p>El informe técnico quedó registrado. El cliente podrá revisarlo desde su portal de cliente.</p>
                <button type="button" className="button" onClick={() => setOpenId(null)}>Volver a la agenda</button>
              </div>
            ) : (
              <>
                {/* Flujo de trabajo visual */}
                <div className="stepper-progress">
                  <div className={`step-node ${current.status === "solicitada" ? "current" : "completed"}`}>
                    <span className="node-icon">1</span>
                    <span className="node-label">Solicitada</span>
                  </div>
                  <div className={`step-line ${current.status !== "solicitada" ? "active" : ""}`} />
                  <div className={`step-node ${current.status === "confirmada" ? "current" : current.status === "en_proceso" || current.status === "finalizada" ? "completed" : ""}`}>
                    <span className="node-icon">2</span>
                    <span className="node-label">Confirmada</span>
                  </div>
                  <div className={`step-line ${current.status === "en_proceso" || current.status === "finalizada" ? "active" : ""}`} />
                  <div className={`step-node ${current.status === "en_proceso" ? "current" : current.status === "finalizada" ? "completed" : ""}`}>
                    <span className="node-icon">3</span>
                    <span className="node-label">{copy.stepLabel}</span>
                  </div>
                  <div className={`step-line ${current.status === "finalizada" ? "active" : ""}`} />
                  <div className={`step-node ${current.status === "finalizada" ? "current completed" : ""}`}>
                    <span className="node-icon">4</span>
                    <span className="node-label">Finalizada</span>
                  </div>
                </div>

                <div className="report-summary-box">
                  <div className="portal-card-top">
                    <StatusBadge status={current.status} />
                    <span className="portal-slot"><Icon name="calendar" />{current.date} · <Icon name="clock" />{current.timeSlot} hrs</span>
                  </div>
                  <h3>{current.serviceName}</h3>
                  <ClientContactLine item={current} />
                  <p><Icon name="car" /><b>Vehículo:</b> {current.vehicleLabel} · Patente <span className="badge-plate">{current.vehiclePlate}</span></p>
                  {current.notes && <p className="portal-note-box"><Icon name="note" /><b>Nota previa:</b> {current.notes}</p>}
                </div>

                {NEXT_STATUS[current.status] && (
                  <div className="sheet-advance-banner">
                    <div>
                      <strong>{copy.nextStepTitle}</strong>
                      <p>
                        {current.status === "solicitada" && copy.confirmHint}
                        {current.status === "confirmada" && copy.startHint}
                      </p>
                    </div>
                    <button type="button" className="button" disabled={busy} onClick={() => void advance(current)}>
                      {busy ? "Guardando…" : <>{NEXT_STATUS[current.status]?.label} <span>↗</span></>}
                    </button>
                  </div>
                )}

                {(current.status === "solicitada" || current.status === "confirmada" || current.status === "en_proceso") && (
                  <div className="sheet-mechanic">
                    <label>
                      {copy.assigneeLabel}
                      <select value={workerChoice} disabled={busy} onChange={(event) => setWorkerChoice(event.target.value)}>
                        <option value="">{current.workerId ? copy.choosePrompt : copy.unassigned}</option>
                        {workers.map((member) => (
                          <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="button button-sm" disabled={busy || !workerChoice || workerChoice === current.workerId} onClick={() => void saveWorker(current)}>
                      {busy ? "Guardando…" : copy.changeAssignee}
                    </button>
                  </div>
                )}

                {(current.status === "solicitada" || current.status === "confirmada") && (
                  <div className="sheet-cancel">
                    {confirmCancel ? (
                      <>
                        <span>¿Cancelar esta cita? Se avisará al cliente.</span>
                        <button type="button" className="toggle-btn danger" disabled={busy} onClick={() => void cancel(current)}>Sí, cancelar cita</button>
                        <button type="button" className="toggle-btn" disabled={busy} onClick={() => setConfirmCancel(false)}>No</button>
                      </>
                    ) : (
                      <button type="button" className="toggle-btn danger" disabled={busy} onClick={() => setConfirmCancel(true)}><Icon name="x" />Cancelar cita</button>
                    )}
                  </div>
                )}

                {actionError && <p className="field-error" role="alert">{actionError}</p>}

                {current.status === "en_proceso" && (
                  <form className="report-form" onSubmit={(event) => { event.preventDefault(); void finish(current); }} noValidate>
                    <div className="form-info-banner">
                      <span><Icon name="info" bare /></span>
                      <p>Al completar este informe y marcar finalizada, el cliente recibirá la ficha técnica en su portal.</p>
                    </div>
                    <label>
                      Kilometraje del vehículo al recibirlo
                      <input value={draft.mileage} onChange={(e) => set("mileage", e.target.value)} placeholder="Ej: 85000" inputMode="numeric" autoComplete="off" />
                    </label>
                    <label>
                      Observaciones técnicas del trabajo realizado *
                      <textarea rows={3} value={draft.observations} onChange={(e) => set("observations", e.target.value)} placeholder="Describe diagnóstico, reparaciones hechas, estado general, etc." />
                      {draftError && <small className="field-error">{draftError}</small>}
                    </label>
                    <label>
                      Repuestos e insumos utilizados (opcional)
                      <textarea rows={2} value={draft.parts} onChange={(e) => set("parts", e.target.value)} placeholder="Ej: Filtro de aceite Bosch, Aceite 10W40 4L, etc." />
                    </label>
                    <label>
                      Recomendaciones para el cliente (opcional)
                      <textarea rows={2} value={draft.recommendations} onChange={(e) => set("recommendations", e.target.value)} placeholder="Ej: Revisar pastillas en 5.000 km, próxima mantención a los 95.000 km." />
                    </label>
                    <div className="modal-actions">
                      <button type="button" className="modal-cancel" onClick={() => setOpenId(null)}>Cancelar</button>
                      <button type="submit" className="button" disabled={busy}>{busy ? "Guardando…" : <>Completar e Informar Cliente <span><Icon name="check" bare /></span></>}</button>
                    </div>
                  </form>
                )}

                {current.status === "finalizada" && (
                  <div className="portal-empty-card">
                    <p><Icon name="checkCircle" />Esta atención ya fue finalizada y su informe técnico fue emitido para el cliente.</p>
                    <button type="button" className="button button-sm" onClick={() => setOpenId(null)}>Cerrar ficha</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
