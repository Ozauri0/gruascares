// Horarios disponibles para citas en Serviteca y Grúas (hora de Chile): de 08:30 a 19:30, uno por hora.
// Es el único lugar donde se definen: si el cliente cambia el horario, se edita aquí.
export const DEFAULT_TIME_SLOTS = [
  "08:30",
  "09:30",
  "10:30",
  "11:30",
  "12:30",
  "13:30",
  "14:30",
  "15:30",
  "16:30",
  "17:30",
  "18:30",
  "19:30",
] as const;

export type TimeSlot = (typeof DEFAULT_TIME_SLOTS)[number];

// Capacidad máxima de citas simultáneas por bloque horario (bahías / mecánicos disponibles). Al llegar a este tope el horario queda lleno y no admite más solicitudes.
export const MAX_CONCURRENT_APPOINTMENTS_PER_SLOT = 4;

/** Límites operativos ajustables (las pruebas los modifican). */
export const limits = {
  /** Máximo de filas por exportación; si se supera hay que acotar el rango de fechas. */
  exportMaxRows: 20000,
};

/** Horario HH:MM válido para un bloque propio (entre 06:00 y 22:30). */
export function isValidSlotFormat(value: unknown): value is string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  return value >= "06:00" && value <= "22:30";
}
