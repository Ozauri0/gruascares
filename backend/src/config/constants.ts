// Horarios disponibles para citas en Serviteca y Grúas (alineados con el frontend)
export const DEFAULT_TIME_SLOTS = [
  "08:30",
  "09:30",
  "10:30",
  "11:30",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
] as const;

export type TimeSlot = (typeof DEFAULT_TIME_SLOTS)[number];

// Capacidad máxima de citas simultáneas por bloque horario (bahías / mecánicos disponibles)
export const MAX_CONCURRENT_APPOINTMENTS_PER_SLOT = 2;

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
