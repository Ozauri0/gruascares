// Disponibilidad de bloques horarios del taller.
// Contrato futuro (T1.5): GET /api/appointments/availability?date=YYYY-MM-DD
// Respuesta esperada: { date: string; slots: SlotAvailability[] }
// Hasta que exista el backend, se generan bloques demostrativos deterministas.

export type SlotAvailability = { time: string; available: boolean };

export const WORKSHOP_SLOTS = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
];

export function getAvailability(isoDate: string): SlotAvailability[] {
  if (!isoDate) return WORKSHOP_SLOTS.map((time) => ({ time, available: true }));
  let hash = 0;
  for (const char of isoDate) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return WORKSHOP_SLOTS.map((time, index) => ({
    time,
    // Ocupación demostrativa estable por fecha; la API real dirá qué está libre.
    available: (hash + index * 7) % 3 !== 0,
  }));
}
