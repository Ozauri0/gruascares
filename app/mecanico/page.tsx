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

export default function MechanicPage() {
  const [agenda, setAgenda] = useState<AgendaItem[]>(MOCK_AGENDA);
  const [date, setDate] = useState(todayISO());
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
            <p className="eyebrow">Taller</p>
            <h1>Agenda del <em>taller.</em></h1>
          </div>
          <div><p className="portal-contact">Atenciones agendadas por día y estado.</p><LogoutButton /></div>
        </section>

        <div className="portal-stack wrap">
          <section aria-label="Agenda diaria">
            <div className="workshop-bar">
              <label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <button type="button" className="filter-pill" onClick={() => setDate(todayISO())}>Hoy</button>
            </div>
            <div className="filter-pills" role="tablist" aria-label="Filtrar por estado">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === option.value}
                  className={filter === option.value ? "filter-pill selected" : "filter-pill"}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="portal-empty">Sin atenciones para ese día y filtro.</p>
            ) : (
              <div className="portal-appointments workshop-list">
                {visible.map((item) => (
                  <article className="portal-card" key={item.id}>
                    <div className="portal-card-top"><StatusBadge status={item.status} /><span className="portal-slot">{item.timeSlot}</span></div>
                    <h3>{item.serviceName}</h3>
                    <p>{item.clientName} · {item.clientPhone}</p>
                    <p>{item.vehicleLabel} · Patente {item.vehiclePlate}</p>
                    {item.notes && <p className="portal-meta">Nota: {item.notes}</p>}
                    <p className="portal-meta">{item.mechanicId ? MOCK_MECHANICS.find((m) => m.id === item.mechanicId)?.name : "Sin mecánico asignado"}</p>
                    <div className="vehicle-actions history-report">
                      <button type="button" onClick={() => openSheet(item)}>Abrir ficha</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <InnerFooter />

      {current && (
        <div className="modal-overlay" onClick={() => setOpenId(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Ficha de atención en taller"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Ficha de atención</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setOpenId(null)}>×</button>
            </div>
            {finishedId === current.id ? (
              <div className="success modal-success"><span>✓</span><h3>Atención finalizada</h3><p>El informe quedó registrado. El cliente será notificado por correo al conectar el servicio de notificaciones.</p><button type="button" className="button" onClick={() => setOpenId(null)}>Volver a la agenda</button></div>
            ) : (
              <>
                <div className="report">
                  <div className="portal-card-top"><StatusBadge status={current.status} /><span className="portal-slot">{current.date} · {current.timeSlot}</span></div>
                  <h3>{current.serviceName}</h3>
                  <p>{current.clientName} · {current.vehicleLabel} ({current.vehiclePlate})</p>
                  {current.notes && <p className="portal-meta">Nota: {current.notes}</p>}
                </div>
                {NEXT_STATUS[current.status] && (
                  <div className="modal-actions sheet-advance">
                    <button type="button" className="button" onClick={() => advance(current)}>{NEXT_STATUS[current.status]?.label} <span>↗</span></button>
                  </div>
                )}
                {current.status === "en_proceso" && (
                  <form onSubmit={(event) => { event.preventDefault(); finish(current); }} noValidate>
                    <label>Kilometraje actual<input value={draft.mileage} onChange={(e) => set("mileage", e.target.value)} placeholder="85000" inputMode="numeric" autoComplete="off" /></label>
                    <label>Observaciones técnicas *<textarea rows={3} value={draft.observations} onChange={(e) => set("observations", e.target.value)} placeholder="Diagnóstico y trabajos realizados" />{draftError && <small className="field-error">{draftError}</small>}</label>
                    <label>Repuestos cambiados<textarea rows={2} value={draft.parts} onChange={(e) => set("parts", e.target.value)} placeholder="Detalle de insumos y repuestos" /></label>
                    <label>Recomendaciones a futuro<textarea rows={2} value={draft.recommendations} onChange={(e) => set("recommendations", e.target.value)} placeholder="Próximas mantenciones sugeridas" /></label>
                    <div className="modal-actions">
                      <button type="button" className="modal-cancel" onClick={() => setOpenId(null)}>Cerrar</button>
                      <button type="submit" className="button">Marcar finalizada <span>↗</span></button>
                    </div>
                  </form>
                )}
                {current.status === "finalizada" && <p className="portal-empty">Esta atención ya fue finalizada y su informe quedó registrado.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
