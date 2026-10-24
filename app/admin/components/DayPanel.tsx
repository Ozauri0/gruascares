"use client";

import { useState } from "react";
import StatusBadge from "../../components/StatusBadge";
import type { BlockedDay } from "../../lib/admin-types";
import type { Worker, WorkerType } from "../../lib/workers-api";
import { formatRut, whatsappUrl } from "../../lib/rut";
import { useDaySchedule } from "../../lib/use-day-schedule";
import type { AgendaItem } from "../../lib/workshop-types";
import ReasonField from "./ReasonField";
import RescheduleForm from "./RescheduleForm";

const TYPE_FOR: Record<"grua" | "serviteca", WorkerType> = { serviteca: "mecanico", grua: "gruero" };

type Props = {
  date: string;
  dayBlock: BlockedDay | undefined;
  items: AgendaItem[];
  workers: Worker[];
  onBlockDay: (reason: string) => Promise<void>;
  onUnblockDay: (id: string) => Promise<void>;
  onAssign: (appointmentId: string, workerId: string) => Promise<void>;
  onReschedule: (appointmentId: string, date: string, timeSlot: string) => Promise<unknown>;
};

const longDate = (iso: string) => {
  const text = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Detalle de un día del calendario maestro, en dos pestañas (Citas / Horarios) para no depender del scroll. */
export default function DayPanel({ date, dayBlock, items, workers, onBlockDay, onUnblockDay, onAssign, onReschedule }: Props) {
  const schedule = useDaySchedule(date);
  const [tab, setTab] = useState<"citas" | "horarios">(items.length > 0 ? "citas" : "horarios");
  const [reason, setReason] = useState("");
  const [newTime, setNewTime] = useState("");
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  const needReason = (): string | null => {
    const text = reason.trim();
    if (text.length < 3) {
      setError("Escribe el motivo del bloqueo (mínimo 3 caracteres).");
      return null;
    }
    return text;
  };

  async function toggleDay() {
    if (dayBlock) return run(() => onUnblockDay(dayBlock.id));
    const text = needReason();
    if (text) await run(() => onBlockDay(text));
  }

  async function toggleSlot(time: string, blockId: string | undefined) {
    if (blockId) return run(async () => { await schedule.unblock(blockId); });
    const text = needReason();
    if (text) await run(async () => { await schedule.block(time, text); });
  }

  const active = items.filter((i) => i.status !== "cancelada");

  return (
    <div className="day-panel">
      <div className="day-head">
        <div>
          <strong className="calendar-selected">{longDate(date)}</strong>
          <span className="day-sub">{dayBlock ? `Bloqueado: ${dayBlock.reason}` : `${active.length} ${active.length === 1 ? "cita" : "citas"}`}</span>
        </div>
        <button type="button" className={dayBlock ? "toggle-btn active" : "toggle-btn"} disabled={busy} onClick={() => void toggleDay()}>
          {dayBlock ? "Desbloquear día" : "Bloquear día"}
        </button>
      </div>

      <ReasonField label="Motivo (para bloquear el día o un horario)" value={reason} onChange={setReason} />
      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="day-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "citas"} className={tab === "citas" ? "on" : ""} onClick={() => setTab("citas")}>Citas ({items.length})</button>
        <button type="button" role="tab" aria-selected={tab === "horarios"} className={tab === "horarios" ? "on" : ""} onClick={() => setTab("horarios")}>Horarios ({schedule.slots.length})</button>
      </div>

      {tab === "citas" ? (
        items.length === 0 ? (
          <p className="portal-empty">Sin citas este día.</p>
        ) : (
          <ul className="day-appts">
            {items.map((item) => {
              const closed = item.status === "finalizada" || item.status === "cancelada";
              const wa = whatsappUrl(item.clientPhone);
              return (
                <li className="day-appt" key={item.id}>
                  <div className="day-appt-top">
                    <strong className="day-appt-time">{item.timeSlot}</strong>
                    <StatusBadge status={item.status} />
                  </div>
                  <p>
                    <b>{item.serviceName}</b> · {item.clientName}
                    {item.clientRut ? ` (${formatRut(item.clientRut)})` : ""}
                    {item.vehiclePlate ? ` · ${item.vehiclePlate}` : ""}
                  </p>
                  {(item.clientPhone || !item.clientEmail) && (
                    <p className="cell-sub">
                      {!item.clientEmail && <span>Sin correo{item.clientPhone ? " · " : ""}</span>}
                      {item.clientPhone && (
                        <>
                          <a href={`tel:${item.clientPhone}`}>{item.clientPhone}</a>{" "}
                          <a href={`tel:${item.clientPhone}`}>Llamar</a>
                          {wa && (
                            <>
                              {" · "}
                              <a href={wa} target="_blank" rel="noopener noreferrer">
                                WhatsApp
                              </a>
                            </>
                          )}
                        </>
                      )}
                    </p>
                  )}
                  <div className="day-appt-actions">
                    <select
                      aria-label={`Trabajador a cargo de la cita de las ${item.timeSlot}`}
                      value={item.workerId ?? ""}
                      disabled={busy || closed}
                      onChange={(e) => e.target.value && void run(() => onAssign(item.id, e.target.value))}
                    >
                      {!item.workerId && <option value="">Sin asignar</option>}
                      {/* un mecánico para serviteca, un gruero para grúas; el ya asignado se mantiene aunque lo hayan dado de baja */}
                      {workers
                        .filter((p) => p.types.includes(TYPE_FOR[item.category]) || p.id === item.workerId)
                        .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      {item.workerId && !workers.some((p) => p.id === item.workerId) && <option value={item.workerId}>{item.workerName ?? "Trabajador"}</option>}
                    </select>
                    {(item.status === "solicitada" || item.status === "confirmada") && (
                      <button type="button" className="toggle-btn" disabled={busy} onClick={() => setRescheduling(rescheduling === item.id ? null : item.id)}>
                        {rescheduling === item.id ? "Cerrar" : "Cambiar hora"}
                      </button>
                    )}
                  </div>
                  {rescheduling === item.id && (
                    <RescheduleForm
                      currentDate={item.date}
                      currentSlot={item.timeSlot}
                      onSubmit={async (d, slot) => { await onReschedule(item.id, d, slot); schedule.reload(); }}
                      onClose={() => setRescheduling(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <div className="slot-manager">
          {schedule.error && <p className="field-error" role="alert">{schedule.error}</p>}
          {schedule.loading && schedule.slots.length === 0 ? (
            <p className="portal-empty">Cargando horarios…</p>
          ) : (
            <ul className="slot-grid">
              {schedule.slots.map((slot) => (
                <li key={slot.time} className={`slot-chip${slot.block ? " blocked" : ""}${slot.custom ? " custom" : ""}`}>
                  <button
                    type="button"
                    className="slot-main"
                    disabled={busy || Boolean(dayBlock)}
                    onClick={() => void toggleSlot(slot.time, slot.block?.id)}
                    title={slot.block ? `Bloqueado: ${slot.block.reason}. Clic para desbloquear` : "Clic para bloquear este horario"}
                  >
                    <strong>{slot.time}</strong>
                    <span>{slot.block ? "Bloqueado" : `${slot.booked} ${slot.booked === 1 ? "cita" : "citas"}`}{slot.custom ? " · propio" : ""}</span>
                  </button>
                  {slot.custom && slot.customId && (
                    <button type="button" className="slot-x" disabled={busy} aria-label={`Eliminar el horario ${slot.time}`} onClick={() => void run(async () => { await schedule.removeSlot(slot.customId!); })}>×</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <small className="slot-hint">{dayBlock ? "El día completo está bloqueado." : "Toca un horario para bloquearlo o desbloquearlo."}</small>
          <form
            className="slot-add"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newTime) return setError("Elige la hora del nuevo horario.");
              void run(async () => { await schedule.add(newTime); setNewTime(""); });
            }}
          >
            <label className="calendar-reason">Nuevo horario<input type="time" min="06:00" max="22:30" value={newTime} onChange={(e) => setNewTime(e.target.value)} /></label>
            <button type="submit" className="toggle-btn" disabled={busy}>Agregar</button>
          </form>
        </div>
      )}
    </div>
  );
}
