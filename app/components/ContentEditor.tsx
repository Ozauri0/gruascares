"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ContentField from "../admin/components/ContentField";
import { discardDraft, fetchDraft, publishDraft, saveDraft } from "../lib/admin-api";
import { useAuth, userHasRole } from "../lib/auth";
import { KEY_ATTR, editableAt, tagElements } from "../lib/edit-dom";
import { ALL_FIELDS, DEFAULTS, SECTIONS, resolve } from "../lib/site-content";
import { useContentPreview } from "./SiteContentProvider";

/** Páginas públicas que se pueden editar en el sitio. */
export const EDITABLE_PATHS = ["/", "/catalogo"];

type Values = Record<string, string>;

/** Valor vigente de cada campo a partir de lo publicado y el borrador guardado. */
function merge(published: Record<string, string>, draft: Record<string, string | null>): Values {
  const values: Values = {};
  for (const f of ALL_FIELDS) {
    const d = draft[f.key];
    values[f.key] = d === undefined ? resolve(published, f.key) : d === null ? f.default : d;
  }
  return values;
}

/** Mover un elemento fijo arrastrando su "asa" (ratón o dedo), sin sacarlo de la pantalla. */
function useDrag<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  const handle = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      drag.current = {
        sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y,
        minX: pos.x - r.left, maxX: pos.x + (window.innerWidth - r.right),
        minY: pos.y - r.top, maxY: pos.y + (window.innerHeight - r.bottom),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      setPos({
        x: Math.min(d.maxX, Math.max(d.minX, d.ox + e.clientX - d.sx)),
        y: Math.min(d.maxY, Math.max(d.minY, d.oy + e.clientY - d.sy)),
      });
    },
    onPointerUp: () => { drag.current = null; },
    onPointerCancel: () => { drag.current = null; },
  };
  const style = { "--dx": `${pos.x}px`, "--dy": `${pos.y}px` } as React.CSSProperties;
  return { ref, style, handle };
}

/**
 * Modo edición del sitio (solo administradores): un botón en la página pública abre el editor sobre la propia
 * página. Lo que se edita se guarda como borrador y solo el público lo ve al "Publicar".
 */
export default function ContentEditor() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const setPreview = useContentPreview();
  const barDrag = useDrag<HTMLDivElement>();
  const panelDrag = useDrag<HTMLElement>();
  const allowed = userHasRole(user, "admin") && EDITABLE_PATHS.includes(pathname);

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [published, setPublished] = useState<Values>({});
  const [saved, setSaved] = useState<Values>({}); // borrador guardado en el servidor (o lo publicado si no hay)
  const [work, setWork] = useState<Values>({}); // lo que se ve y edita ahora
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"elemento" | "campos">("elemento");
  const [panelOpen, setPanelOpen] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "discard">("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<"" | "discard" | "publish">("");
  const box = useRef<HTMLDivElement>(null);
  const current = useRef(work);
  current.current = work;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { published: pub, draft } = await fetchDraft();
      const pubValues = merge(pub, {});
      const draftValues = merge(pub, draft);
      setPublished(pubValues);
      setSaved(draftValues);
      setWork(draftValues);
      setMessage(null);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "No se pudo cargar el borrador.", error: true });
      setEditing(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Entrar con ?editar=1 (enlace desde el panel de administración).
  useEffect(() => {
    if (allowed && new URLSearchParams(window.location.search).has("editar")) setEditing(true);
  }, [allowed]);
  useEffect(() => {
    if (editing) void load();
  }, [editing, load]);

  // Mientras se edita, la página muestra el borrador de trabajo; al salir vuelve a lo publicado.
  useEffect(() => {
    setPreview(editing && !loading && Object.keys(work).length > 0 ? work : null);
    return () => setPreview(null);
  }, [editing, loading, work, setPreview]);

  const unsaved = useMemo(() => ALL_FIELDS.filter((f) => work[f.key] !== saved[f.key]), [work, saved]);
  const pending = useMemo(() => ALL_FIELDS.filter((f) => saved[f.key] !== published[f.key]), [saved, published]);
  const hasChanges = unsaved.length > 0 || pending.length > 0;

  useEffect(() => {
    if (!editing || unsaved.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing, unsaved.length]);

  // Marcado de lo editable, resaltado al pasar el cursor y selección al tocar (nada navega mientras se edita).
  useEffect(() => {
    if (!editing || loading) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => tagElements(current.current));
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["src", "style"] });

    const style = document.createElement("style");
    style.textContent = `[${KEY_ATTR}]{cursor:pointer!important}`;
    document.head.append(style);

    const inUi = (target: EventTarget | null) => target instanceof Element && target.closest("[data-gc-ui]") !== null;
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
    const onMove = (event: MouseEvent) => outline(inUi(event.target) ? null : editableAt(event.clientX, event.clientY));
    const hide = () => outline(null);
    const onClick = (event: MouseEvent) => {
      if (inUi(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const target = editableAt(event.clientX, event.clientY);
      const key = target?.getAttribute(KEY_ATTR);
      if (key) {
        setSelected(key);
        setTab("elemento");
        setPanelOpen(true);
      }
    };
    const onSubmit = (event: Event) => {
      if (!inUi(event.target)) event.preventDefault();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", hide);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      style.remove();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", hide);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("scroll", hide, true);
      document.querySelectorAll(`[${KEY_ATTR}]`).forEach((el) => el.removeAttribute(KEY_ATTR));
    };
  }, [editing, loading]);

  useEffect(() => {
    if (editing && !loading) tagElements(work);
  }, [editing, loading, work]);

  function leave() {
    if (unsaved.length > 0 && !window.confirm("Hay cambios sin guardar en el borrador. ¿Salir y perderlos?")) return;
    setEditing(false);
    setSelected(null);
    setConfirm("");
    const url = new URL(window.location.href);
    if (url.searchParams.has("editar")) {
      url.searchParams.delete("editar");
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function persist() {
    const values = Object.fromEntries(unsaved.map((f) => [f.key, work[f.key] === DEFAULTS[f.key] ? null : work[f.key]]));
    if (unsaved.length > 0) await saveDraft(values);
  }

  async function run(kind: "save" | "publish" | "discard", action: () => Promise<string>) {
    if (busy) return;
    setBusy(kind);
    setMessage(null);
    setConfirm("");
    try {
      setMessage({ text: await action() });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "No se pudo completar la acción.", error: true });
    } finally {
      setBusy("");
    }
  }

  const onSave = () =>
    run("save", async () => {
      await persist();
      await load();
      return "Borrador guardado. El público aún no lo ve: pulsa Publicar cuando esté listo.";
    });
  const onPublish = () =>
    run("publish", async () => {
      await persist();
      await publishDraft();
      await load();
      router.refresh();
      return "Publicado: el sitio público ya muestra estos cambios.";
    });
  const onDiscard = () =>
    run("discard", async () => {
      await discardDraft();
      await load();
      return "Borrador descartado. Se muestra lo publicado.";
    });

  if (!allowed) return null;

  if (!editing) {
    return (
      <button type="button" className="ed-enter" data-gc-ui onClick={() => setEditing(true)}>
        <span aria-hidden="true">✏️</span> Editar página
      </button>
    );
  }

  const field = ALL_FIELDS.find((f) => f.key === selected);
  const renderField = (f: (typeof ALL_FIELDS)[number]) => (
    <ContentField
      key={f.key}
      field={f}
      value={work[f.key] ?? ""}
      customized={published[f.key] !== f.default}
      dirty={work[f.key] !== saved[f.key]}
      onChange={(value) => setWork((cur) => ({ ...cur, [f.key]: value }))}
    />
  );
  const status = loading
    ? "Cargando borrador…"
    : unsaved.length > 0
      ? `${unsaved.length} cambio(s) sin guardar`
      : pending.length > 0
        ? `Borrador guardado: ${pending.length} cambio(s) sin publicar`
        : "Sin cambios pendientes";

  return (
    <>
      <div ref={box} data-gc-ui aria-hidden="true" className="ed-outline" />

      <div className="ed-bar" ref={barDrag.ref} style={barDrag.style} data-gc-ui role="region" aria-label="Modo edición">
        <span className="ed-badge ed-grip" title="Arrastra para mover el menú" {...barDrag.handle}><b aria-hidden="true">⠿</b><i aria-hidden="true" /> Modo edición</span>
        <span className="ed-status" aria-live="polite">{message ? <span className={message.error ? "ed-error" : ""}>{message.text}</span> : status}</span>
        <span className="ed-actions">
          <button type="button" className="toggle-btn" onClick={() => setPanelOpen((o) => !o)}>{panelOpen ? "Ocultar panel" : "Mostrar panel"}</button>
          <button type="button" className="toggle-btn" disabled={loading || !!busy || unsaved.length === 0} onClick={() => void onSave()}>{busy === "save" ? "Guardando…" : "Guardar borrador"}</button>
          {confirm === "discard" ? (
            <button type="button" className="toggle-btn danger confirm" disabled={!!busy} onClick={() => void onDiscard()} onBlur={() => setConfirm("")} autoFocus>¿Descartar todo?</button>
          ) : (
            <button type="button" className="toggle-btn" disabled={loading || !!busy || !hasChanges} onClick={() => setConfirm("discard")}>Descartar borrador</button>
          )}
          {confirm === "publish" ? (
            <button type="button" className="toggle-btn active" disabled={!!busy} onClick={() => void onPublish()} onBlur={() => setConfirm("")} autoFocus>Confirmar: se verá públicamente</button>
          ) : (
            <button type="button" className="toggle-btn active" disabled={loading || !!busy || !hasChanges} onClick={() => setConfirm("publish")}>{busy === "publish" ? "Publicando…" : "Publicar"}</button>
          )}
          <button type="button" className="toggle-btn" onClick={leave}>Salir</button>
        </span>
      </div>

      {panelOpen && (
        <aside className="ed-panel" ref={panelDrag.ref} style={panelDrag.style} data-gc-ui aria-label="Editor de contenido">
          <div className="ed-panel-head">
            <span className="ed-grip ed-panel-grip" title="Arrastra para mover el panel" {...panelDrag.handle}><b aria-hidden="true">⠿</b></span>
            <div className="cms-tabs ve-tabs" role="tablist" aria-label="Editor">
              <button type="button" role="tab" aria-selected={tab === "elemento"} className={tab === "elemento" ? "on" : ""} onClick={() => setTab("elemento")}>Elemento</button>
              <button type="button" role="tab" aria-selected={tab === "campos"} className={tab === "campos" ? "on" : ""} onClick={() => setTab("campos")}>Todos los campos</button>
            </div>
            <button type="button" className="modal-close" aria-label="Cerrar panel" onClick={() => setPanelOpen(false)}>×</button>
          </div>
          {tab === "elemento" ? (
            field ? (
              <div className="cms-fields">{renderField(field)}</div>
            ) : (
              <p className="cms-desc ve-empty">Toca un texto o una imagen de la página para editarlo aquí. Los cambios se ven al instante y solo el público los verá al publicar.</p>
            )
          ) : (
            <div className="ve-all">
              {SECTIONS.map((section) => {
                const dirty = section.fields.filter((f) => work[f.key] !== saved[f.key]).length;
                return (
                  <details className="cms-section" key={section.id}>
                    <summary>
                      <span>{section.title}</span>
                      {dirty > 0 && <span className="cf-flag dirty">{dirty} sin guardar</span>}
                    </summary>
                    <div className="cms-fields">
                      {section.fields.map((f) => (
                        <button type="button" key={f.key} className={`ve-field-link${work[f.key] !== saved[f.key] ? " dirty" : ""}`} onClick={() => { setSelected(f.key); setTab("elemento"); }}>
                          <span>{f.label}</span>
                          <small>{f.kind === "image" ? "Imagen" : (work[f.key] ?? "").replace(/\n/g, " ").slice(0, 60)}</small>
                        </button>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </aside>
      )}
    </>
  );
}
