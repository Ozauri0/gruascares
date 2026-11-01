// Validación y normalización de RUT chileno (Módulo 11, sin dependencias).
// Se guarda en base de datos sin puntos y con guion (ej. "12345678-5" o "12345678-K").

export function computeRutDv(bodyDigits: string | number): string {
  const digits = String(bodyDigits).replace(/\D/g, "");
  let sum = 0;
  let multiplier = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const mod = 11 - (sum % 11);
  if (mod === 11) return "0";
  if (mod === 10) return "K";
  return String(mod);
}

/**
 * Normaliza un RUT al formato canónico sin puntos y con guion (ej. "12.345.678-k" → "12345678-K").
 * Si la entrada no tiene forma de RUT, devuelve el texto limpio en mayúsculas.
 */
export function normalizeRut(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.toUpperCase().replace(/[^0-9K]/g, "");
  if (cleaned.length < 2) return cleaned;
  const body = cleaned.slice(0, -1).replace(/^0+/, "");
  const dv = cleaned.slice(-1);
  if (!body) return cleaned;
  return `${body}-${dv}`;
}

/**
 * Comprueba que el RUT tenga entre 7 y 8 dígitos de cuerpo y que su dígito verificador (Módulo 11) sea válido.
 */
export function isValidRut(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const compact = raw.trim().toUpperCase().replace(/[\s.]/g, "");
  if (!/^\d{7,8}-?[\dK]$/.test(compact)) return false;
  const plain = compact.replace("-", "");
  const body = plain.slice(0, -1);
  const dv = plain.slice(-1);
  const num = Number(body);
  if (!Number.isInteger(num) || num < 1_000_000 || num > 99_999_999) return false;
  return computeRutDv(body) === dv;
}

/**
 * Formatea un RUT para mostrarlo en pantalla con puntos y guion (ej. "12345678-5" → "12.345.678-5").
 */
export function formatRut(raw: string | null | undefined): string {
  if (!raw) return "";
  const norm = normalizeRut(raw);
  const match = /^(\d+)-([\dK])$/.exec(norm);
  if (!match) return raw;
  const [, body, dv] = match;
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

/** Genera un RUT chileno válido y determinista a partir de un número base (útil para seeds y pruebas). */
export function makeValidRut(correlative: number): string {
  const body = String(10_000_000 + correlative);
  return `${body}-${computeRutDv(body)}`;
}
