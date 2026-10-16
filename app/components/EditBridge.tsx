"use client";

import { useEffect, useRef } from "react";
import type { ContentOverrides } from "../lib/site-content";

/** Separador invisible que delimita la clave dentro de los textos marcados. */
export const EDIT_MARK = "⁣";
export const EDIT_IMAGE_TAG = "#gcedit=";

// La clave viaja dentro del texto como caracteres de ancho cero (0 = U+200B, 1 = U+200C), 8 bits por letra.
const ZERO = "\u200b";
const ONE = "\u200c";
export function encodeKey(key: string): string {
  let bits = "";
  for (const ch of key) bits += ch.charCodeAt(0).toString(2).padStart(8, "0");
  return EDIT_MARK + bits.replace(/0/g, ZERO).replace(/1/g, ONE) + EDIT_MARK;
}
export function decodeKey(encoded: string): string {
  const bits = encoded.replace(new RegExp(ZERO, "g"), "0").replace(new RegExp(ONE, "g"), "1");
  let key = "";
  for (let i = 0; i + 8 <= bits.length; i += 8) key += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
  return key;
}

/** True si esta página se abrió dentro del editor visual del administrador (mismo origen). */
export function isEditFrame(): boolean {
  try {
    return window.parent !== window && new URLSearchParams(window.location.search).has("editar") && window.parent.location.origin === window.location.origin;
  } catch {
    return false;
  }
}

const KEY_ATTR = "data-gc-key";

/** Asigna data-gc-key a los elementos cuyo texto, imagen o fondo lleva una clave marcada. */
function tagElements() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    const start = text.indexOf(EDIT_MARK);
    if (start === -1) continue;
    const end = text.indexOf(EDIT_MARK, start + 1);
    if (end === -1 || !node.parentElement) continue;
    node.parentElement.setAttribute(KEY_ATTR, decodeKey(text.slice(start + 1, end)));
  }
  for (const el of document.querySelectorAll<HTMLElement>(`img[src*="gcedit="], [style*="gcedit="]`)) {
    const source = el instanceof HTMLImageElement ? el.getAttribute("src") ?? "" : el.getAttribute("style") ?? "";
    const match = /gcedit=([a-z0-9._-]+)/.exec(source);
    if (match) el.setAttribute(KEY_ATTR, match[1]);
  }
}

/** Elemento editable bajo el punto: el más cercano a la vista que sea visible (atraviesa capas decorativas). */
function editableAt(x: number, y: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const target = el.closest<HTMLElement>(`[${KEY_ATTR}]`);
    if (!target) continue;
    if (getComputedStyle(target).opacity === "0" || getComputedStyle(target).visibility === "hidden") continue;
    return target;
  }
  return null;
}

/**
 * Puente del editor visual dentro de la página: marca lo editable, resalta al pasar el cursor,
 * avisa al editor qué se tocó (sin navegar) y aplica los borradores que éste envía.
 */
export function EditBridge({ onDraft }: { onDraft: (values: ContentOverrides) => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `html{scroll-behavior:auto!important}body *{cursor:default}[${KEY_ATTR}]{cursor:pointer!important}`;
    document.head.append(style);

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tagElements);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["src", "style"] });

    const outline = (target: HTMLElement | null) => {
      const el = box.current;
      if (!el) return;
      if (!target) {
        el.style.display = "none";
        return;
      }
      const rect = target.getBoundingClientRect();
      Object.assign(el.style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    };

    const onMove = (event: MouseEvent) => outline(editableAt(event.clientX, event.clientY));
    const onLeave = () => outline(null);
    // Dentro del editor nada navega ni se envía: tocar un elemento solo lo selecciona.
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const target = editableAt(event.clientX, event.clientY);
      if (target) window.parent.postMessage({ type: "gc-select", key: target.getAttribute(KEY_ATTR) }, window.location.origin);
    };
    const onSubmit = (event: Event) => event.preventDefault();
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === "gc-draft" && event.data.values && typeof event.data.values === "object") onDraft(event.data.values);
      if (event.data?.type === "gc-focus" && typeof event.data.key === "string") {
        const el = document.querySelector<HTMLElement>(`[${KEY_ATTR}="${CSS.escape(event.data.key)}"]`);
        el?.scrollIntoView({ block: "center" });
        outline(el);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("message", onMessage);
    window.addEventListener("scroll", onLeave, true);
    window.parent.postMessage({ type: "gc-ready", path: window.location.pathname }, window.location.origin);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      style.remove();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("scroll", onLeave, true);
    };
  }, [onDraft]);

  return <div ref={box} aria-hidden="true" style={{ display: "none", position: "fixed", zIndex: 2147483000, pointerEvents: "none", outline: "2px solid #029834", outlineOffset: 2, background: "rgba(2,152,52,.12)", borderRadius: 4 }} />;
}
