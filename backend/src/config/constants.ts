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
