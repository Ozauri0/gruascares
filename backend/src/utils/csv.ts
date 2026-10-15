/**
 * Escapa una celda para CSV (RFC 4180) y neutraliza "CSV injection": si el texto empieza con
 * = + - @ (o tabulador / retorno de carro), Excel y Calc lo interpretan como fórmula; se antepone un apóstrofo.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
