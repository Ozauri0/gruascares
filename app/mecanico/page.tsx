"use client";

import { useEffect, useState } from "react";
import InnerFooter from "../components/InnerFooter";
import InnerHeader from "../components/InnerHeader";
import LogoutButton from "../components/LogoutButton";
import StatusBadge from "../components/StatusBadge";
import { MOCK_AGENDA, MOCK_MECHANICS, todayISO } from "../lib/workshop-mocks";
import type { AgendaItem } from "../lib/workshop-mocks";
import type { AppointmentStatus } from "../lib/portal-types";

const FILTERS: { value: AppointmentStatus | "todas"; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "solicitada", label: "Solicitadas" },
  { value: "confirmada", label: "Confirmadas" },
  { value: "en_proceso", label: "En taller" },
  { value: "finalizada", label: "Finalizadas" },
];

const NEXT_STATUS: Partial<Record<AppointmentStatus, { to: AppointmentStatus; label: string }>> = {
  solicitada: { to: "confirmada", label: "Confirmar cita" },
  confirmada: { to: "en_proceso", label: "Iniciar atención" },
};

type ReportDraft = { mileage: string; observations: string; parts: string; recommendations: string };

// Abre en hoy; si hoy no tiene atenciones, en el día con citas más cercano.
function initialDate(): string {
  const today = todayISO();
  const dates = Array.from(new Set(MOCK_AGENDA.map((item) => item.date)));
  if (dates.includes(today) || dates.length === 0) return today;
  const diff = (iso: string) => Math.abs(new Date(iso).getTime() - new Date(today).getTime());
  return dates.sort((a, b) => diff(a) - diff(b))[0];
}

export default function MechanicPage() {
  const [agenda, setAgenda] = useState<AgendaItem[]>(MOCK_AGENDA);
  const [date, setDate] = useState(initialDate);
  const [filter, setFilter] = useState<AppointmentStatus | "todas">("todas");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReportDraft>({ mileage: "", observations: "", parts: "", recommendations: "" });
  const [draftError, setDraftError] = useState("");
  const [finishedId, setFinishedId] = useState<string | null>(null);

  const visible = agenda
    .filter((item) => item.date === date)
    .filter((item) => filter === "todas" || item.status === filter)
    .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));

  const current = agenda.find((item) => item.id === openId);

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId ]);

  function openSheet(item: AgendaItem) {
    setDraft({ mileage: "", observations: "", parts: "", recommendations: "" });
    setDraftError("");
    setFinishedId(null);
    setOpenId(item.id);
  }

  function advance(item: AgendaItem) {
    const next = NEXT_STATUS[item.status];
    if (!next) return;
    setAgenda((list) => list.map((row) => (row.id === item.id ? { ...row, status: next.to } : row)));
  }

  function finish(item: AgendaItem) {
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
    // POST /api/appointments/:id/report al conectar la API real (T1.7).
    setAgenda((list) => list.map((row) => (row.id === item.id ? { ...row, status: "finalizada" } : row)));
    setFinishedId(item.id);
  }

  function set(field: keyof ReportDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Taller Mecánico</p>
            <h1>Agenda del <em>mecánico.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Panel operativo para gestionar citas del día, avanzar estados de trabajo y emitir informes técnicos.</p>
            <LogoutButton />
          </div>
        </section>

        <div className="portal-stack wrap">
          <section aria-label="Agenda diaria" className="workshop-layout">
            <aside className="workshop-side">
              <div className="workshop-bar">
                <label>
                  Fecha de trabajo
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </label>
                <button type="button" className="filter-pill" onClick={() => setDate(todayISO())}>📅 Hoy</button>
              </div>

              <div className="workshop-filters" role="tablist" aria-label="Filtrar por estado">
                {FILTERS.map((option) => {
                  const count = agenda.filter((item) => item.date === date && (option.value === "todas" || item.status === option.value)).length;
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
            {visible.length === 0 ? (
              <div className="portal-empty-card">
                <p>No hay servicios programados para la fecha y filtro seleccionados.</p>
                <button type="button" className="button button-sm" onClick={() => { setDate(todayISO()); setFilter("todas"); }}>
                  Restablecer a hoy
                </button>
              </div>
            ) : (
              <div className="portal-appointments workshop-list">
                {visible.map((item) => (
                  <article className="portal-card workshop-card" key={item.id}>
                    <div className="portal-card-top">
                      <StatusBadge status={item.status} />
                      <span className="portal-slot">🕒 {item.timeSlot} hrs</span>
                    </div>
                    <h3>{item.serviceName}</h3>
                    <div className="mechanic-card-details">
                      <p>👤 <b>Cliente:</b> {item.clientName} · 📞 <a href={`tel:${item.clientPhone}`}>{item.clientPhone}</a></p>
                      <p>🚗 <b>Vehículo:</b> {item.vehicleLabel} · Patente <span className="badge-plate">{item.vehiclePlate}</span></p>
                      {item.notes && <p className="portal-note-box">📝 <b>Nota del cliente:</b> {item.notes}</p>}
                      <p className="portal-meta">🔧 <b>Asignado a:</b> {item.mechanicId ? MOCK_MECHANICS.find((m) => m.id === item.mechanicId)?.name : "Sin mecánico asignado"}</p>
                    </div>
                    <div className="vehicle-actions mechanic-actions">
                      <button type="button" className="button-accent" onClick={() => openSheet(item)}>
                        📋 Abrir ficha técnica & opciones <span>→</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            </div>
          </section>
        </div>
      </main>
      <InnerFooter />

      {current && (
        <div className="modal-overlay" onClick={() => setOpenId(null)}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            aria-label="Ficha técnica de atención en taller"
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
                <span>✓</span>
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
                    <span className="node-label">En Taller</span>
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
                    <span className="portal-slot">📅 {current.date} · 🕒 {current.timeSlot} hrs</span>
                  </div>
                  <h3>{current.serviceName}</h3>
                  <p>👤 <b>Cliente:</b> {current.clientName} · 📞 <a href={`tel:${current.clientPhone}`}>{current.clientPhone}</a></p>
                  <p>🚗 <b>Vehículo:</b> {current.vehicleLabel} · Patente <span className="badge-plate">{current.vehiclePlate}</span></p>
                  {current.notes && <p className="portal-note-box">📝 <b>Nota previa:</b> {current.notes}</p>}
                </div>

                {NEXT_STATUS[current.status] && (
                  <div className="sheet-advance-banner">
                    <div>
                      <strong>Siguiente paso en el taller:</strong>
                      <p>
                        {current.status === "solicitada" && "Confirma la cita para asignarle box y repuestos."}
                        {current.status === "confirmada" && "Indica que el vehículo ya ingresó y se comenzó el trabajo."}
                      </p>
                    </div>
                    <button type="button" className="button" onClick={() => advance(current)}>
                      {NEXT_STATUS[current.status]?.label} <span>↗</span>
                    </button>
                  </div>
                )}

                {current.status === "en_proceso" && (
                  <form className="report-form" onSubmit={(event) => { event.preventDefault(); finish(current); }} noValidate>
                    <div className="form-info-banner">
                      <span>ℹ️</span>
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
                      <button type="submit" className="button">Completar e Informar Cliente <span>✓</span></button>
                    </div>
                  </form>
                )}

                {current.status === "finalizada" && (
                  <div className="portal-empty-card">
                    <p>✅ Esta atención ya fue finalizada y su informe técnico fue emitido para el cliente.</p>
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
