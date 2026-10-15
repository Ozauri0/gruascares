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
