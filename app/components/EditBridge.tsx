"use client";

import { useEffect, useRef } from "react";
import { ALL_FIELDS, resolve, type ContentOverrides } from "../lib/site-content";

/** True si esta página se abrió dentro del editor visual del administrador (mismo origen). */
export function isEditFrame(): boolean {
  try {
    return window.parent !== window && new URLSearchParams(window.location.search).has("editar") && window.parent.location.origin === window.location.origin;
  } catch {
    return false;
  }
}

const KEY_ATTR = "data-gc-key";

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
function tagElements(values: ContentOverrides) {
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
export function EditBridge({ values, onDraft }: { values: ContentOverrides; onDraft: (values: ContentOverrides) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const current = useRef(values);
  current.current = values;

  // Al cambiar el borrador el contenido cambia: se vuelve a marcar.
  useEffect(() => {
    const id = requestAnimationFrame(() => tagElements(values));
    return () => cancelAnimationFrame(id);
  }, [values]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `html{scroll-behavior:auto!important}body *{cursor:default}[${KEY_ATTR}]{cursor:pointer!important}`;
    document.head.append(style);

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => tagElements(current.current));
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

  return <div ref={box} data-gc-ui aria-hidden="true" style={{ display: "none", position: "fixed", zIndex: 2147483000, pointerEvents: "none", outline: "2px solid #029834", outlineOffset: 2, background: "rgba(2,152,52,.12)", borderRadius: 4 }} />;
}
