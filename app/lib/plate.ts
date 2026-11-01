// Validación de patente chilena (formato estándar, sin dependencias).
// - Formato antiguo: 2 letras + 4 dígitos (ej. AB1234, AB·1234)
// - Formato nuevo: 4 letras + 2 dígitos (ej. ABCD12, ABCD·12)

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidChileanPlate(raw: string): boolean {
  const plate = normalizePlate(raw);
  return /^[A-Z]{2}\d{4}$/.test(plate) || /^[A-Z]{4}\d{2}$/.test(plate);
}

export function formatPlate(raw: string): string {
  const plate = normalizePlate(raw);
  if (/^[A-Z]{4}\d{2}$/.test(plate)) return `${plate.slice(0, 4)}·${plate.slice(4)}`;
  if (/^[A-Z]{2}\d{4}$/.test(plate)) return `${plate.slice(0, 2)}·${plate.slice(2)}`;
  return plate;
}
