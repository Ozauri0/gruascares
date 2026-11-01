"use client";

import { useRef, useState } from "react";
import { uploadImage } from "../../lib/admin-api";
import { GALLERY_IMAGES, type ContentField as Field } from "../../lib/site-content";

type Props = {
  field: Field;
  value: string;
  /** True si el valor guardado ya difiere del original. */
  customized: boolean;
  /** True si lo escrito aún no se guarda. */
  dirty: boolean;
  onChange: (value: string) => void;
};

/** Un campo del panel de contenido: texto, texto largo o imagen (subir, elegir de la galería o restaurar). */
export default function ContentField({ field, value, customized, dirty, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [gallery, setGallery] = useState(false);
  const id = `cf-${field.key}`;
  const changed = value !== field.default;

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`cf${dirty ? " dirty" : ""}`}>
      <div className="cf-head">
        <label htmlFor={id}>{field.label}</label>
        <span className="cf-flags">
          {dirty && <span className="cf-flag dirty">Sin guardar</span>}
          {!dirty && customized && <span className="cf-flag">Editado</span>}
          {changed && <button type="button" className="link-btn" onClick={() => onChange(field.default)}>Restaurar original</button>}
        </span>
      </div>

      {field.kind === "image" ? (
        <div className="cf-image">
          <img src={value} alt="" className="cf-thumb" />
          <div className="cf-image-actions">
            <input ref={fileRef} id={id} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
            <button type="button" className="toggle-btn active" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Subiendo…" : "Subir imagen"}</button>
            <button type="button" className="toggle-btn" onClick={() => setGallery((open) => !open)}>{gallery ? "Cerrar galería" : "Elegir de la galería"}</button>
          </div>
          {gallery && (
            <div className="cf-gallery" role="listbox" aria-label="Galería de imágenes">
              {GALLERY_IMAGES.map((src) => (
                <button key={src} type="button" role="option" aria-selected={value === src} className={value === src ? "on" : ""} onClick={() => { onChange(src); setGallery(false); }}>
                  <img src={src} alt={src.replace("/images/", "")} loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {error && <small className="field-error" role="alert">{error}</small>}
          {field.hint && <small className="cf-hint">{field.hint}</small>}
          <small className="cf-hint">PNG, JPG o WebP de hasta 5 MB.</small>
        </div>
      ) : field.kind === "text" ? (
        <input id={id} value={value} maxLength={300} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <>
          <textarea id={id} rows={field.kind === "rich" ? 3 : 4} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} />
          {field.kind === "rich" && <small className="cf-hint">Enter = salto de línea · *palabra* = resaltado en verde.</small>}
        </>
      )}
      {field.hint && field.kind !== "image" && <small className="cf-hint">{field.hint}</small>}
    </div>
  );
}
