// Fechas en la zona horaria del taller (Villarrica, Chile), igual que el backend.

export const WORKSHOP_TIME_ZONE = "America/Santiago";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: WORKSHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Hoy" en Chile como YYYY-MM-DD (no la fecha UTC ni la del dispositivo). */
export function todayInSantiago(now: Date = new Date()): string {
  return formatter.format(now);
}
