export type RichToken = { type: "br" } | { type: "text"; value: string } | { type: "em"; value: string };

/**
 * Formato de los textos editables: cada salto de línea es un <br> y *texto* se resalta en verde.
 * Devuelve tokens (nunca HTML), así lo escrito por el administrador no puede inyectar marcado.
 */
export function parseRich(value: string): RichToken[] {
  const tokens: RichToken[] = [];
  value.split("\n").forEach((line, index) => {
    if (index > 0) tokens.push({ type: "br" });
    for (const part of line.split(/(\*[^*]+\*)/g)) {
      if (part === "") continue;
      if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) tokens.push({ type: "em", value: part.slice(1, -1) });
      else tokens.push({ type: "text", value: part });
    }
  });
  return tokens;
}
