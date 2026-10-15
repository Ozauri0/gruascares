/** Límites de longitud para texto libre ingresado por clientes y personal. */
export const MAX_LEN = {
  name: 100,
  email: 255,
  phone: 50,
  location: 255,
  notes: 1000,
  report: 5000,
} as const;

/** Devuelve el primer campo (de los provistos) que supera su máximo, o null. */
export function findTooLong(fields: Array<[label: string, value: unknown, max: number]>): string | null {
  for (const [label, value, max] of fields) {
    if (typeof value === "string" && value.length > max) {
      return `${label} no puede superar los ${max} caracteres`;
    }
  }
  return null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
