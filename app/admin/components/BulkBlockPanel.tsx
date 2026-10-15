"use client";

import { useState } from "react";
import { bulkBlockDays, bulkUnblockDays } from "../../lib/admin-api";
import { todayInSantiago } from "../../lib/dates";

// Lunes a domingo; el valor es el día de la semana de JavaScript (0 = domingo).
const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

/** Bloqueo (o desbloqueo) de días completos por día de la semana en un rango de fechas, p. ej. todos los fines de semana del año. */
export default function BulkBlockPanel({ onDone }: { onDone: () => void }) {
  const today = todayInSantiago();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(`${today.slice(0, 4)}-12-31`);
  const [weekdays, setWeekdays] = useState<number[]>([6, 0]);
  const [reason, setReason] = useState("Fin de semana");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (value: number) => setWeekdays((current) => (current.includes(value) ? current.filter((d) => d !== value) : [...current, value]));

  async function run(kind: "block" | "unblock") {
    setMessage(null);
    if (weekdays.length === 0) return setMessage({ ok: false, text: "Elige al menos un día de la semana." });
    if (!startDate || !endDate) return setMessage({ ok: false, text: "Indica las fechas de inicio y término." });
    if (kind === "block" && reason.trim().length < 3) return setMessage({ ok: false, text: "Indica el motivo (mínimo 3 caracteres)." });
    setBusy(true);
    try {
      const range = { startDate, endDate, weekdays };
      if (kind === "block") {
        const r = await bulkBlockDays(range, reason.trim());
        const extra = r.skipped > 0 ? ` (${r.skipped} ya estaban bloqueados)` : "";
        const warn = r.affectedAppointments > 0 ? ` Ojo: hay ${r.affectedAppointments} cita(s) en esos días; no se cancelan, reprográmalas.` : "";
        setMessage({ ok: true, text: `${r.created} día(s) bloqueados${extra}.${warn}` });
      } else {
        const r = await bulkUnblockDays(range);
        setMessage({ ok: true, text: `${r.removed} día(s) desbloqueados.` });
      }
      onDone();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "No se pudo completar la acción." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="bulk-panel">
      <summary>Bloqueo masivo por días de la semana</summary>
      <div className="bulk-body">
        <div className="bulk-dates">
          <label>Desde<input type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label>Hasta<input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        </div>
        <div className="bulk-days" role="group" aria-label="Días de la semana">
          {WEEKDAYS.map((d) => (
            <button key={d.value} type="button" aria-pressed={weekdays.includes(d.value)} className={weekdays.includes(d.value) ? "chip on" : "chip"} onClick={() => toggle(d.value)}>{d.label}</button>
          ))}
        </div>
        <div className="bulk-presets">
          <button type="button" className="link-btn" onClick={() => { setWeekdays([6, 0]); setReason("Fin de semana"); }}>Fines de semana</button>
          <button type="button" className="link-btn" onClick={() => { setWeekdays([0]); setReason("Domingo no laboral"); }}>Solo domingos</button>
          <button type="button" className="link-btn" onClick={() => setWeekdays([1, 2, 3, 4, 5, 6, 0])}>Todos</button>
        </div>
        <label>Motivo<input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="bulk-actions">
          <button type="button" className="toggle-btn active" disabled={busy} onClick={() => void run("block")}>Bloquear días</button>
          <button type="button" className="toggle-btn" disabled={busy} onClick={() => void run("unblock")}>Desbloquear días</button>
        </div>
        <small className="bulk-note">Rango máximo de 400 días. No cancela citas existentes y no toca los bloqueos de un solo horario.</small>
        {message && <p className={message.ok ? "bulk-msg ok" : "field-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      </div>
    </details>
  );
}
