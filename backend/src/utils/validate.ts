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
