/**
 * Clave para comparar teléfonos escritos de distinta forma (+56 9 1234 5678, 912345678, 9 1234-5678): los últimos
 * 8 dígitos. Devuelve "" si el número es demasiado corto para compararlo con confianza.
 */
export function phoneKey(phone: unknown): string {
  if (typeof phone !== "string") return "";
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : "";
}
