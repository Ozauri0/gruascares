const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Valida una fecha calendario YYYY-MM-DD real (rechaza 2026-02-31, 2026-13-01, etc.). */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Zona horaria del taller (Villarrica, Chile). */
export const WORKSHOP_TIME_ZONE = "America/Santiago";

/** Reloj inyectable: las pruebas pueden fijar la hora sin tocar el sistema. */
export const clock = {
  now: (): Date => new Date(),
};

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: WORKSHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Fecha (YYYY-MM-DD) y hora (HH:mm) actuales en la zona horaria del taller. */
export function workshopNow(now: Date = clock.now()): { date: string; time: string } {
  const parts = Object.fromEntries(partsFormatter.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** "Hoy" en Chile (no en UTC). */
export function todayInSantiago(now: Date = clock.now()): string {
  return workshopNow(now).date;
}

/** Un bloque horario "HH:mm" de una fecha ya pasó (o está en curso) según la hora del taller. */
export function isSlotPast(date: string, slot: string, now: Date = clock.now()): boolean {
  const current = workshopNow(now);
  if (date < current.date) return true;
  if (date > current.date) return false;
  return slot <= current.time;
}

/** Semana calendario (lunes a domingo) que contiene la fecha YYYY-MM-DD. */
export function weekRange(isoDate: string): { start: string; end: string } {
  const [y, m, d] = isoDate.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const sinceMonday = (day.getUTCDay() + 6) % 7; // lunes = 0 ... domingo = 6
  const monday = new Date(Date.UTC(y, m - 1, d - sinceMonday));
  const sunday = new Date(Date.UTC(y, m - 1, d - sinceMonday + 6));
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}
