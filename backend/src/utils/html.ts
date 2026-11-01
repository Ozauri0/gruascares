const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapa texto no confiable antes de insertarlo en HTML. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Escapa y convierte saltos de línea en <br> para campos multilínea. */
export function escapeMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

/** Elimina saltos de línea y caracteres de control (evita inyección de cabeceras en el asunto). */
export function sanitizeHeader(value: unknown): string {
  return String(value ?? "").replace(/[\r\n\u0000-\u001f]+/g, " ").trim();
}
