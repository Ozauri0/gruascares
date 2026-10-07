/**
 * Utilidades para normalización y validación de patentes chilenas de vehículos.
 * 
 * Formatos estándar del Registro de Vehículos Motorizados (RVM) en Chile:
 * 1. Formato Antiguo (hasta 2007): 2 letras seguidas de 4 números (ej. AB1234, AB·1234)
 * 2. Formato Nuevo (desde 2007): 4 letras seguidas de 2 números (ej. ABCD12, ABCD·12)
 */

export function normalizePlate(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidChileanPlate(raw: string): boolean {
  const plate = normalizePlate(raw);
  // Formato antiguo: 2 letras + 4 números
  // Formato nuevo: 4 letras + 2 números
  return /^[A-Z]{2}\d{4}$/.test(plate) || /^[A-Z]{4}\d{2}$/.test(plate);
}

export function formatChileanPlate(raw: string): string {
  const plate = normalizePlate(raw);
  if (/^[A-Z]{4}\d{2}$/.test(plate)) {
    return `${plate.slice(0, 4)}·${plate.slice(4)}`;
  }
  if (/^[A-Z]{2}\d{4}$/.test(plate)) {
    return `${plate.slice(0, 2)}·${plate.slice(2)}`;
  }
  return plate;
}
