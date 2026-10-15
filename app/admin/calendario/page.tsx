"use client";

import { useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import StatusBadge from "../../components/StatusBadge";
import AdminNav from "../components/AdminNav";
import { todayInSantiago } from "../../lib/dates";
import { isoDay, useCalendar } from "../../lib/use-calendar";
import { useDaySchedule } from "../../lib/use-day-schedule";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DEFAULT_REASON = "Día no laboral";

export default function CalendarPage() {
  const [year, setYear] = useState(() => Number(todayInSantiago().slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayInSantiago().slice(5, 7)) - 1);
  const [selected, setSelected] = useState<string | null>(null);
  const { byDay, blocked, staff, loading, error, reload, block, unblock, assign } = useCalendar(year, month);
  const schedule = useDaySchedule(selected);
  const [newTime, setNewTime] = useState("");
  const [slotReason, setSlotReason] = useState("Bloque no disponible");
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const blockedByDate = Object.fromEntries(blocked.map((b) => [b.date, b]));
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<string | null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoDay(year, month, i + 1)),
  ];

  const monthLabel = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  const selectedItems = selected ? byDay[selected] ?? [] : [];
  const selectedBlock = selected ? blockedByDate[selected] : undefined;

  function move(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelected(null);
    setActionError("");
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setActionError("");
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock(iso: string) {
    const existing = blockedByDate[iso];
    if (existing) {
      await run(() => unblock(existing.id));
      return;
    }
    const text = reason.trim();
    if (text.length < 3) {
      setActionError("Indica el motivo del bloqueo (mínimo 3 caracteres).");
      return;
    }
    await run(async () => {
      await block(iso, text);
      setReason(DEFAULT_REASON);
    });
  }

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Calendario <em>maestro.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Vista operativa de la carga del taller, asignación de mecánicos y bloqueo de feriados o días inhábiles.</p>
          </div>
        </section>

        <div className="portal-stack wrap">
          <AdminNav current="calendario" />

          {error && (
            <div className="portal-empty-card" role="alert">
              <p>{error}</p>
              <button type="button" className="button button-sm" onClick={reload}>Reintentar</button>
            </div>
          )}

          <section aria-label="Calendario del taller" aria-busy={loading}>
            <div className="portal-toolbar calendar-toolbar">
              <div className="month-nav">
                <button type="button" aria-label="Mes anterior" onClick={() => move(-1)}>←</button>
                <strong>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</strong>
                <button type="button" aria-label="Mes siguiente" onClick={() => move(1)}>→</button>
              </div>
              <div className="calendar-legend">
                <span className="legend-item"><i className="legend-dot dot-active" /> Con atenciones</span>
                <span className="legend-item"><i className="legend-dot dot-blocked" /> Día bloqueado</span>
                {loading && <span className="legend-item">Cargando…</span>}
              </div>
            </div>

            <div className="calendar-layout">
              <div className="calendar">
                <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
                <div className="calendar-grid">
                  {cells.map((iso, index) => {
                    if (!iso) return <span className="calendar-empty" key={`e-${index}`} />;
                    const count = (byDay[iso] ?? []).length;
                    const isBlocked = Boolean(blockedByDate[iso]);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => { setSelected(iso); setActionError(""); setNewTime(""); }}
                        className={[
                          "calendar-day",
                          selected === iso ? "selected" : "",
                          isBlocked ? "blocked" : "",
                          count > 0 ? "has-items" : "",
                        ].join(" ")}
                        aria-label={`${iso}${isBlocked ? ", bloqueado" : ""}, ${count} citas`}
                      >
                        <span className="calendar-number">{Number(iso.slice(8, 10))}</span>
                        {count > 0 && <span className="calendar-count">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="calendar-detail" aria-label="Detalle del día">
                {!selected ? (
                  <p className="portal-empty">Selecciona un día para ver sus citas y opciones.</p>
                ) : (
                  <>
                    <div className="portal-card-top">
                      <strong className="calendar-selected">{selected}</strong>
                      <button
                        type="button"
                        className={selectedBlock ? "toggle-btn active" : "toggle-btn"}
                        disabled={busy}
                        onClick={() => void toggleBlock(selected)}
                      >
                        {selectedBlock ? "Desbloquear día" : "Bloquear día"}
                      </button>
                    </div>
                    {!selectedBlock && (
                      <label className="calendar-reason">
                        Motivo del bloqueo
                        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} placeholder="Ej: Feriado, capacitación…" />
                      </label>
                    )}
                    {selectedBlock && <p className="blocked-note">Bloqueado: {selectedBlock.reason}. No se agenda ni se confirma.</p>}
                    {actionError && <p className="field-error" role="alert">{actionError}</p>}
                    <section className="slot-manager" aria-label="Horarios del día">
                      <h3>Horarios del día</h3>
                      {schedule.error && <p className="field-error" role="alert">{schedule.error}</p>}
                      {schedule.loading && schedule.slots.length === 0 ? (
                        <p className="portal-empty">Cargando horarios…</p>
                      ) : (
                        <ul className="slot-list">
                          {schedule.slots.map((slot) => (
                            <li key={slot.time} className={slot.block ? "slot-row blocked" : "slot-row"}>
                              <strong>{slot.time}</strong>
                              <span className="slot-meta">
                                {slot.custom ? "Propio · " : ""}{slot.booked} {slot.booked === 1 ? "cita" : "citas"}
                                {slot.block ? ` · Bloqueado: ${slot.block.reason}` : ""}
                              </span>
                              <span className="slot-actions">
                                <button
                                  type="button"
                                  className="toggle-btn"
                                  disabled={busy || Boolean(selectedBlock)}
                                  onClick={() => void run(() => (slot.block ? schedule.unblock(slot.block.id) : schedule.block(slot.time, slotReason.trim())))}
                                >
                                  {slot.block ? "Desbloquear" : "Bloquear"}
                                </button>
                                {slot.custom && slot.customId && (
                                  <button
                                    type="button"
                                    className="toggle-btn danger"
                                    disabled={busy}
                                    onClick={() => void run(() => schedule.removeSlot(slot.customId!))}
                                    aria-label={`Eliminar el horario ${slot.time}`}
                                  >
                                    Eliminar
                                  </button>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <label className="calendar-reason">
                        Motivo para bloquear un horario
                        <input value={slotReason} onChange={(event) => setSlotReason(event.target.value)} maxLength={200} />
                      </label>
                      <form
                        className="slot-add"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!newTime) {
                            setActionError("Elige la hora del nuevo horario.");
                            return;
                          }
                          void run(async () => {
                            await schedule.add(newTime);
                            setNewTime("");
                          });
                        }}
                      >
                        <label className="calendar-reason">
                          Nuevo horario
                          <input type="time" min="06:00" max="22:30" value={newTime} onChange={(event) => setNewTime(event.target.value)} />
                        </label>
                        <button type="submit" className="toggle-btn" disabled={busy}>Agregar horario</button>
                      </form>
                    </section>
                    {selectedItems.length === 0 ? (
                      <p className="portal-empty">Sin citas ese día.</p>
                    ) : (
                      <div className="calendar-items">
                        {selectedItems.map((item) => (
                          <div className="calendar-item" key={item.id}>
                            <div className="portal-card-top"><StatusBadge status={item.status} /><span className="portal-slot">{item.timeSlot}</span></div>
                            <strong>{item.serviceName}</strong>
                            <p>{item.clientName}{item.vehiclePlate ? ` · ${item.vehiclePlate}` : ""}</p>
                            <label>Mecánico
                              <select
                                value={item.mechanicId ?? ""}
                                disabled={busy || item.status === "finalizada" || item.status === "cancelada"}
                                onChange={(event) => event.target.value && void run(() => assign(item.id, event.target.value))}
                              >
                                {!item.mechanicId && <option value="">Sin asignar</option>}
                                {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                              </select>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </aside>
            </div>
          </section>
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
