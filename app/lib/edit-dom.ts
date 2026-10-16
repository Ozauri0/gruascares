// Utilidades del editor en la página: marcan qué elemento muestra cada campo y encuentran el que se toca.
import { ALL_FIELDS, resolve, type ContentOverrides } from "../lib/site-content";

export const KEY_ATTR = "data-gc-key";

/** Texto comparable: sin espacios ni asteriscos de énfasis (el formato rich añade saltos y *). */
export function comparable(value: string): string {
  return value.replace(/[\s*]+/g, "");
}

function gatherText(el: Element): string {
  let out = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.nodeValue ?? "";
    else if (node.nodeType === Node.ELEMENT_NODE) out += gatherText(node as Element);
  }
  return out;
}

/**
 * Asigna data-gc-key a lo que muestra cada campo, comparando el contenido vigente con la página
 * (no se altera ningún texto: así el diseño es idéntico al del sitio público).
 */
export function tagElements(values: ContentOverrides) {
  const texts = new Map<string, string>();
  const images = new Map<string, string>();
  for (const field of ALL_FIELDS) {
    const value = resolve(values, field.key);
    if (value === "") continue;
    if (field.kind === "image") {
      if (!images.has(value)) images.set(value, field.key);
    } else if (!texts.has(comparable(value))) texts.set(comparable(value), field.key);
  }

  for (const el of document.querySelectorAll(`[${KEY_ATTR}]`)) el.removeAttribute(KEY_ATTR);
  const all = Array.from(document.body.querySelectorAll<HTMLElement>("*")).filter((el) => !el.closest("[data-gc-ui]") && !["SCRIPT", "STYLE"].includes(el.tagName));

  const found = new Map<HTMLElement, string>();
  for (const el of all) {
    // Texto propio de un nodo (p. ej. "Llámanos ahora" junto a un icono) o texto completo del elemento (títulos con énfasis).
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const key = texts.get(comparable(node.nodeValue ?? ""));
      if (key && comparable(node.nodeValue ?? "") !== "") found.set(el, key);
    }
    const whole = comparable(gatherText(el));
    const key = whole === "" ? undefined : texts.get(whole);
    if (key && !found.has(el)) found.set(el, key);

    if (el instanceof HTMLImageElement) {
      const key = images.get(el.getAttribute("src") ?? "");
      if (key) found.set(el, key);
    }
    const inline = el.getAttribute("style") ?? "";
    if (inline.includes("url(")) {
      for (const [src, key] of images) if (inline.includes(src)) found.set(el, key);
    }
  }
  // Si un hijo ya representa el mismo campo, solo se marca el más interno.
  for (const [el, key] of found) {
    const inner = Array.from(found).some(([other, otherKey]) => other !== el && otherKey === key && el.contains(other));
    if (!inner) el.setAttribute(KEY_ATTR, key);
  }
}

/** Elemento editable bajo el punto: el más cercano a la vista que sea visible (atraviesa capas decorativas). */
export function editableAt(x: number, y: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const target = el.closest<HTMLElement>(`[${KEY_ATTR}]`);
    if (!target) continue;
    if (getComputedStyle(target).opacity === "0" || getComputedStyle(target).visibility === "hidden") continue;
    return target;
  }
  return null;
}

