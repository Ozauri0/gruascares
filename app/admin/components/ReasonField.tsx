"use client";

export const BLOCK_REASONS = ["Feriado", "Capacitación", "Mantención de equipos", "Vacaciones", "Día administrativo", "Fin de semana", "Sin disponibilidad"];

type Props = { label: string; value: string; onChange: (value: string) => void };

/** Motivo de un bloqueo: motivos frecuentes de un toque y el campo sigue siendo libre para escribir otro. */
export default function ReasonField({ label, value, onChange }: Props) {
  return (
    <div className="reason-field">
      <label className="calendar-reason">
        {label}
        <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} placeholder="Elige uno o escribe el tuyo…" />
      </label>
      <div className="reason-chips" role="group" aria-label="Motivos frecuentes">
        {BLOCK_REASONS.map((text) => (
          <button key={text} type="button" aria-pressed={value.trim() === text} className={value.trim() === text ? "chip on" : "chip"} onClick={() => onChange(text)}>{text}</button>
        ))}
      </div>
    </div>
  );
}
