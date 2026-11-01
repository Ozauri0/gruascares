"use client";

import { useEffect, useState } from "react";
import { fetchDaySchedule } from "../../lib/admin-api";
import type { DaySchedule } from "../../lib/admin-types";
import { todayInSantiago } from "../../lib/dates";

type Props = {
  currentDate: string;
  currentSlot: string;
  onSubmit: (date: string, timeSlot: string) => Promise<void>;
  onClose: () => void;
};

/** Cambio de fecha/hora de una cita: ofrece solo los horarios del día elegido que no están bloqueados ni llenos. */
export default function RescheduleForm({ currentDate, currentSlot, onSubmit, onClose }: Props) {
  const [date, setDate] = useState(currentDate);
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [slot, setSlot] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    setSchedule(null);
    setSlot("");
    setError("");
    fetchDaySchedule(date, controller.signal)
      .then(setSchedule)
      .catch((err) => {
        if ((err as Error)?.name !== "AbortError") setError(err instanceof Error ? err.message : "No se pudieron cargar los horarios.");
      });
    return () => controller.abort();
  }, [date]);

  const options = (schedule?.slots ?? []).filter(
    (s) => !s.block && s.booked < (schedule?.capacityPerSlot ?? 0) && !(date === currentDate && s.time === currentSlot)
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!slot) {
      setError("Elige el nuevo horario.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(date, slot);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la hora.");
      setSaving(false);
    }
  }

  return (
    <form className="reschedule-form" onSubmit={submit}>
      <label>Nueva fecha<input type="date" min={todayInSantiago()} value={date} onChange={(e) => setDate(e.target.value)} required /></label>
      <label>Nuevo horario
        <select value={slot} onChange={(e) => setSlot(e.target.value)} disabled={!schedule}>
          <option value="">{!schedule ? "Cargando…" : options.length === 0 ? "Sin horarios libres" : "Elige un horario"}</option>
          {options.map((s) => <option key={s.time} value={s.time}>{s.time}{s.booked > 0 ? ` · ${s.booked}/${schedule?.capacityPerSlot}` : ""}</option>)}
        </select>
      </label>
      <div className="reschedule-actions">
        <button type="submit" className="toggle-btn active" disabled={saving}>{saving ? "Guardando…" : "Guardar cambio"}</button>
        <button type="button" className="toggle-btn" onClick={onClose} disabled={saving}>Cancelar</button>
      </div>
      {error && <small className="field-error" role="alert">{error}</small>}
      <small className="reschedule-note">Se avisa al cliente por correo.</small>
    </form>
  );
}
