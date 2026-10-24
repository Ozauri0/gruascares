// Validación y formato de RUT chileno (Módulo 11, sin dependencias).
// Se envía y guarda sin puntos y con guion (ej. "12345678-5" o "12345678-K").

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
 * Normaliza un RUT al formato sin puntos y con guion (ej. "12.345.678-k" → "12345678-K").
 */
export function normalizeRut(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^0-9K]/g, "");
  if (cleaned.length < 2) return cleaned;
  const body = cleaned.slice(0, -1).replace(/^0+/, "");
  const dv = cleaned.slice(-1);
  if (!body) return cleaned;
  return `${body}-${dv}`;
}

/**
 * Valida que el RUT tenga cuerpo de 7 a 8 dígitos y dígito verificador Módulo 11 correcto.
 */
export function isValidRut(raw: string): boolean {
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
 * Formatea un RUT con puntos y guion (ej. "12345678-5" → "12.345.678-5").
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

/**
 * Construye un enlace `https://wa.me/...` a partir de un teléfono chileno o internacional.
 * Si el teléfono tiene 9 dígitos y empieza en 9, antepone `56`. Devuelve `null` si no hay dígitos suficientes.
 */
export function whatsappUrl(phone: string | null | undefined, message?: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) {
    digits = `56${digits}`;
  } else if (digits.length === 8) {
    digits = `569${digits}`;
  }
  if (digits.length < 9) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}
