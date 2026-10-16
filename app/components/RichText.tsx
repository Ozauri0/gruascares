import { parseRich } from "../lib/rich-text";

/** Muestra un texto editable: saltos de línea y *énfasis* como elementos React (nunca HTML crudo). */
export function RichText({ value }: { value: string }) {
  return (
    <>
      {parseRich(value).map((token, i) =>
        token.type === "br" ? <br key={i} /> : token.type === "em" ? <em key={i}>{token.value}</em> : token.value
      )}
    </>
  );
}
