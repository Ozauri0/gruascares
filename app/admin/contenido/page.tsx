"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import AdminNav from "../components/AdminNav";
import ContentField from "../components/ContentField";
import { fetchContent, saveContent } from "../../lib/admin-api";
import { ALL_FIELDS, DEFAULTS, SECTIONS, resolve } from "../../lib/site-content";

type Panel = "elemento" | "campos";
type Device = "escritorio" | "movil";

const DESKTOP_WIDTH = 1280;

const PAGES = [
  { path: "/", label: "Inicio" },
  { path: "/catalogo", label: "Tienda" },
];

export default function ContentAdminPage() {
  const [saved, setSaved] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<Panel>("elemento");
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("escritorio");
  const [previewPath, setPreviewPath] = useState("/");
  const [menuOpen, setMenuOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  // La vista de escritorio se dibuja a 1280 px reales y se reduce para caber (así se ve el diseño de escritorio de verdad).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [saved]);
  const scale = device === "escritorio" && box.width > 0 ? Math.min(1, box.width / DESKTOP_WIDTH) : 1;
  const frameStyle: React.CSSProperties =
    device === "escritorio"
      ? { width: scale < 1 ? DESKTOP_WIDTH : "100%", height: scale < 1 ? box.height / scale : "100%", transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "top left" }
      : {};

  const load = useCallback(() => {
    setError("");
    fetchContent()
      .then((content) => {
        setSaved(content);
        setDraft(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, resolve(content, f.key)])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el contenido."));
  }, []);
  useEffect(load, [load]);

  // Solo los campos cuyo valor escrito difiere del vigente.
  const changes = useMemo(
    () => (saved ? ALL_FIELDS.filter((f) => (draft[f.key] ?? "") !== resolve(saved, f.key)) : []),
    [saved, draft]
  );

  // Envía el borrador a la página de la vista previa para que se vea al instante.
  const push = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: "gc-draft", values: draft }, window.location.origin);
  }, [draft]);
  useEffect(push, [push]);

  // Mensajes de la página: lista para recibir el borrador / se tocó un elemento.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "gc-ready") push();
      if (event.data?.type === "gc-select" && typeof event.data.key === "string" && ALL_FIELDS.some((f) => f.key === event.data.key)) {
        setSelected(event.data.key);
        setPanel("elemento");
        setMenuOpen(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [push]);

  function pick(key: string) {
    setSelected(key);
    setPanel("elemento");
    frame.current?.contentWindow?.postMessage({ type: "gc-focus", key }, window.location.origin);
  }

  async function save() {
    if (!saved || changes.length === 0 || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      // Lo que vuelve al original se envía como null (se elimina el valor guardado).
      const values = Object.fromEntries(changes.map((f) => [f.key, draft[f.key] === DEFAULTS[f.key] ? null : draft[f.key]]));
      await saveContent(values);
      setSaved(await fetchContent());
      setNotice(`Se guardaron ${changes.length} cambio(s). Ya se ven en el sitio.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  const discard = () => saved && setDraft(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, resolve(saved, f.key)])));
  const field = ALL_FIELDS.find((f) => f.key === selected);
  const renderField = (f: (typeof ALL_FIELDS)[number]) => (
    <ContentField
      key={f.key}
      field={f}
      value={draft[f.key] ?? ""}
      customized={saved?.[f.key] !== undefined}
      dirty={changes.includes(f)}
      onChange={(value) => setDraft((current) => ({ ...current, [f.key]: value }))}
    />
  );

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Contenido del <em>sitio.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Toca cualquier texto o imagen de la vista previa para editarlo ahí mismo. Los cambios se ven al instante y se publican al guardar; lo que no edites conserva su contenido original.</p>
          </div>
        </section>

        <div className="portal-stack wrap">
          <AdminNav current="contenido" />

          {error && (
            <div className="portal-empty-card" role="alert">
              <p>{error}</p>
              {!saved && <button type="button" className="button button-sm" onClick={load}>Reintentar</button>}
            </div>
          )}

          {saved && (
            <>
              <div className="ve-layout">
                <section className="ve-stage" aria-label="Vista previa editable del sitio">
                  <div className="cms-preview-bar">
                    <select value={previewPath} onChange={(e) => setPreviewPath(e.target.value)} aria-label="Página que se edita">
                      {PAGES.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
                    </select>
                    <span className="ve-device" role="group" aria-label="Tamaño de pantalla">
                      <button type="button" className={device === "escritorio" ? "on" : ""} aria-pressed={device === "escritorio"} onClick={() => setDevice("escritorio")}>Escritorio</button>
                      <button type="button" className={device === "movil" ? "on" : ""} aria-pressed={device === "movil"} onClick={() => setDevice("movil")}>Móvil</button>
                    </span>
                    <button type="button" className="toggle-btn ve-open-menu" onClick={() => setMenuOpen((o) => !o)}>{menuOpen ? "Cerrar editor" : "Abrir editor"}</button>
                    <a className="toggle-btn" href={previewPath} target="_blank" rel="noreferrer">Abrir sitio ↗</a>
                  </div>
                  <div ref={wrap} className={`ve-frame-wrap ${device}`}>
                    <iframe ref={frame} style={frameStyle} key={previewPath} src={`${previewPath}?editar=1`} title="Vista previa editable del sitio" onLoad={push} />
                  </div>
                </section>

                <aside className={`ve-menu${menuOpen ? " open" : ""}`} aria-label="Editor de contenido">
                  <div className="cms-tabs ve-tabs" role="tablist" aria-label="Editor">
                    <button type="button" role="tab" aria-selected={panel === "elemento"} className={panel === "elemento" ? "on" : ""} onClick={() => setPanel("elemento")}>Elemento</button>
                    <button type="button" role="tab" aria-selected={panel === "campos"} className={panel === "campos" ? "on" : ""} onClick={() => setPanel("campos")}>Todos los campos</button>
                  </div>

                  {panel === "elemento" ? (
                    field ? (
                      <div className="cms-fields">
                        {renderField(field)}
                        <button type="button" className="toggle-btn" onClick={() => setSelected(null)}>Listo</button>
                      </div>
                    ) : (
                      <p className="cms-desc ve-empty">Toca un texto o una imagen de la vista previa para editarlo aquí. También puedes buscarlo en “Todos los campos”.</p>
                    )
                  ) : (
                    <div className="ve-all">
                      {SECTIONS.map((section) => {
                        const sectionChanges = section.fields.filter((f) => changes.includes(f)).length;
                        return (
                          <details className="cms-section" key={section.id}>
                            <summary>
                              <span>{section.title}</span>
                              {sectionChanges > 0 && <span className="cf-flag dirty">{sectionChanges} sin guardar</span>}
                            </summary>
                            <div className="cms-fields">
                              {section.fields.map((f) => (
                                <button type="button" key={f.key} className={`ve-field-link${changes.includes(f) ? " dirty" : ""}`} onClick={() => pick(f.key)}>
                                  <span>{f.label}</span>
                                  <small>{f.kind === "image" ? "Imagen" : (draft[f.key] ?? "").replace(/\n/g, " ").slice(0, 60)}</small>
                                </button>
                              ))}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  )}
                </aside>
              </div>

              <div className="cms-savebar" role="region" aria-label="Guardar cambios">
                <span aria-live="polite">{changes.length > 0 ? `${changes.length} cambio(s) sin guardar` : notice || "Sin cambios pendientes"}</span>
                <span className="cms-save-actions">
                  <button type="button" className="toggle-btn" disabled={changes.length === 0 || saving} onClick={discard}>Descartar</button>
                  <button type="button" className="toggle-btn active" disabled={changes.length === 0 || saving} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar cambios"}</button>
                </span>
              </div>
            </>
          )}
          {!saved && !error && <div className="portal-empty-card" aria-busy="true"><p>Cargando contenido…</p></div>}
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
