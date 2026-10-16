"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import AdminNav from "../components/AdminNav";
import ContentField from "../components/ContentField";
import { fetchContent, saveContent } from "../../lib/admin-api";
import { ALL_FIELDS, DEFAULTS, SECTIONS, resolve } from "../../lib/site-content";

type View = "editar" | "vista";

export default function ContentAdminPage() {
  const [saved, setSaved] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("editar");
  const [previewKey, setPreviewKey] = useState(0);
  const [previewPath, setPreviewPath] = useState("/");

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
      setPreviewKey((n) => n + 1);
      setNotice(`Se guardaron ${changes.length} cambio(s). Ya se ven en el sitio.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  const discard = () => saved && setDraft(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, resolve(saved, f.key)])));

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
            <p className="portal-subtext">Edita los textos e imágenes de la web pública. Los cambios se ven en la vista previa al guardar; lo que no edites conserva su contenido original.</p>
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
              <div className="cms-tabs" role="tablist" aria-label="Vista">
                <button type="button" role="tab" aria-selected={view === "editar"} className={view === "editar" ? "on" : ""} onClick={() => setView("editar")}>Editar</button>
                <button type="button" role="tab" aria-selected={view === "vista"} className={view === "vista" ? "on" : ""} onClick={() => setView("vista")}>Vista previa</button>
              </div>

              <div className={`cms-layout view-${view}`}>
                <div className="cms-editor">
                  {SECTIONS.map((section, index) => {
                    const sectionChanges = section.fields.filter((f) => changes.includes(f)).length;
                    return (
                      <details className="cms-section" key={section.id} open={index < 2}>
                        <summary>
                          <span>{section.title}</span>
                          {sectionChanges > 0 && <span className="cf-flag dirty">{sectionChanges} sin guardar</span>}
                        </summary>
                        <div className="cms-fields">
                          {section.description && <p className="cms-desc">{section.description}</p>}
                          {section.fields.map((field) => (
                            <ContentField
                              key={field.key}
                              field={field}
                              value={draft[field.key] ?? ""}
                              customized={saved[field.key] !== undefined}
                              dirty={changes.includes(field)}
                              onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
                            />
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>

                <aside className="cms-preview" aria-label="Vista previa del sitio">
                  <div className="cms-preview-bar">
                    <select value={previewPath} onChange={(e) => setPreviewPath(e.target.value)} aria-label="Página de la vista previa">
                      <option value="/">Inicio</option>
                      <option value="/catalogo">Tienda</option>
                    </select>
                    <button type="button" className="toggle-btn" onClick={() => setPreviewKey((n) => n + 1)}>Recargar</button>
                    <a className="toggle-btn" href={previewPath} target="_blank" rel="noreferrer">Abrir ↗</a>
                  </div>
                  <iframe key={`${previewPath}-${previewKey}`} src={previewPath} title="Vista previa del sitio" />
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
