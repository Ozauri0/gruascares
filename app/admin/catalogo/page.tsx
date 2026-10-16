"use client";

import { useEffect, useRef, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import AdminNav from "../components/AdminNav";
import { formatPrice } from "../../lib/catalog";
import type { Product } from "../../lib/catalog";
import { saveContent, uploadImage } from "../../lib/admin-api";
import { SHOP_TOP_HIDDEN_KEY } from "../../lib/site-content";
import { useSiteContent } from "../../components/SiteContentProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth";
import { useAdminCatalog } from "../../lib/use-catalog";

type ProductForm = { name: string; text: string; category: string; price: string; stock: string; image: string; featured: boolean };

const EMPTY_FORM: ProductForm = { name: "", text: "", category: "MANTENCIÓN", price: "", stock: "", image: "", featured: false };

/** Número editable: se guarda al salir del campo (o con Enter), no en cada tecla. */
function NumberCell({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => Promise<void> }) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(String(value)), [value]);

  async function commit() {
    const next = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(next) || next < 0) {
      setDraft(String(value)); // valor inválido: se vuelve al guardado
      return;
    }
    if (next === value) return;
    setSaving(true);
    try {
      await onCommit(next);
    } catch {
      setDraft(String(value)); // el error lo muestra la página
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      className="cell-input"
      type="number"
      min={0}
      step={1}
      aria-label={label}
      value={draft}
      disabled={saving}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
    />
  );
}

type AdminView = "grid" | "list";
const ADMIN_VIEW_KEY = "gruas-cares-admin-catalog-view";

/** Foto del producto (o su arte automático si no tiene imagen). */
function Thumb({ item }: { item: Product }) {
  return <div className={`admin-thumb product-art ${item.art}`}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <i />}</div>;
}

/** Sube la foto del producto desde el dispositivo (PNG, JPG o WebP, máx. 5 MB) y entrega su ruta. */
function ImageUpload({ value, onChange, error }: { value: string; onChange: (url: string) => void; error?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  const message = uploadError || error;
  return (
    <div className="cf-image">
      <span className="field-label">Imagen del producto{value === "" ? " *" : ""}</span>
      {value !== "" && <div className="image-preview"><img src={value} alt="Vista previa del producto" /></div>}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
      <button type="button" className="toggle-btn active" disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? "Subiendo…" : value === "" ? "Subir imagen desde mi dispositivo" : "Cambiar imagen"}
      </button>
      <small className="cf-hint">PNG, JPG o WebP de hasta 5 MB.</small>
      {message && <small className="field-error" role="alert">{message}</small>}
    </div>
  );
}

export default function CatalogAdminPage() {
  const [view, setView] = useState<AdminView>("list");
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin"; // el vendedor gestiona el catálogo, sin el resto de la administración
  const t = useSiteContent();
  const topHidden = t(SHOP_TOP_HIDDEN_KEY) === "1";
  const [topSaving, setTopSaving] = useState(false);
  const [topError, setTopError] = useState("");
  async function setTopVisible(visible: boolean) {
    setTopSaving(true);
    setTopError("");
    try {
      await saveContent({ [SHOP_TOP_HIDDEN_KEY]: visible ? null : "1" });
      router.refresh(); // vuelve a leer el contenido publicado
    } catch {
      setTopError("No se pudo guardar el cambio. Intenta de nuevo.");
    } finally {
      setTopSaving(false);
    }
  }
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ADMIN_VIEW_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      /* sin almacenamiento: queda la vista en filas */
    }
  }, []);
  function changeView(next: AdminView) {
    setView(next);
    try {
      window.localStorage.setItem(ADMIN_VIEW_KEY, next);
    } catch {
      /* preferencia no persistente */
    }
  }

  const { products, loading, error, reload, add, patch, remove: removeProduct } = useAdminCatalog();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<{ name?: string; price?: string; stock?: string; image?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [imageModal, setImageModal] = useState<{ id: string; url: string; error: string } | null>(null);
  const [actionError, setActionError] = useState("");

  async function update(id: string, change: Parameters<typeof patch>[1]) {
    setActionError("");
    try {
      await patch(id, change);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo guardar el cambio.");
      throw err;
    }
  }

  async function remove(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(null);
    setActionError("");
    try {
      await removeProduct(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo eliminar el producto.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = "El nombre es obligatorio.";
    const price = Number(form.price);
    const stock = Number(form.stock);
    if (form.price.trim() === "" || !Number.isInteger(price) || price < 0) next.price = "Precio inválido.";
    if (form.stock.trim() === "" || !Number.isInteger(stock) || stock < 0) next.stock = "Stock inválido.";
    if (form.image === "") next.image = "Sube una imagen del producto.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      await add({
        name: form.name.trim(),
        description: form.text.trim() === "" ? "Producto del catálogo Grúas Cares." : form.text.trim(),
        category: form.category.trim() === "" ? "GENERAL" : form.category.trim(),
        price,
        stock,
        art: "oil", // solo respaldo interno; la tienda siempre muestra la foto
        image: form.image,
        featured: form.featured,
      });
      setModal(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "No se pudo crear el producto." });
    } finally {
      setSaving(false);
    }
  }

  function set(field: keyof ProductForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openImage(item: Product) {
    setImageModal({ id: item.id, url: item.image ?? "", error: "" });
  }

  async function saveImage() {
    if (!imageModal) return;
    const url = imageModal.url.trim();
    if (url === "") return;
    try {
      await patch(imageModal.id, { image: url });
      setImageModal(null);
    } catch (err) {
      setImageModal((current) => (current ? { ...current, error: err instanceof Error ? err.message : "No se pudo guardar la imagen." } : current));
    }
  }

  const actions = (item: Product) => (
    <>
      <button type="button" className="toggle-btn" onClick={() => openImage(item)}>Imagen</button>
      <button
        type="button"
        className={confirmDelete === item.id ? "toggle-btn danger confirm" : "toggle-btn danger"}
        onClick={() => void remove(item.id)}
        onBlur={() => setConfirmDelete(null)}
      >
        {confirmDelete === item.id ? "Confirmar" : "Eliminar"}
      </button>
    </>
  );
  const visibility = (item: Product) => (
    <button type="button" className="toggle-btn" onClick={() => void update(item.id, { active: !item.active }).catch(() => null)}>
      {item.active ? "Ocultar" : "Mostrar"}
    </button>
  );

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">{isAdmin ? "Administración" : <Link href="/vendedor">← Ventas · Inicio</Link>}</p>
            <h1>Catálogo y <em>precios.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Edición de precios referenciales, disponibilidad de inventario y visibilidad directa en la tienda online.</p>
          </div>
        </section>

        <div className="portal-stack wrap">
          {isAdmin && <AdminNav current="catalogo" />}

          <section aria-label="Gestión del catálogo">
            {isAdmin && <div className="top-section-toggle">
              <label>
                <input type="checkbox" checked={!topHidden} disabled={topSaving} onChange={(e) => void setTopVisible(e.target.checked)} />
                Mostrar la sección «Top ventas» en la tienda
              </label>
              <small>{topHidden ? "Oculta: los productos destacados se ven igual en el catálogo completo." : "Muestra arriba los productos marcados como destacados (también aparecen en el catálogo completo si se oculta)."}</small>
              {topError && <span role="alert" className="field-error">{topError}</span>}
            </div>}
            <div className="portal-toolbar">
              <div className="portal-toolbar-left">
                <span className="portal-badge-counter">{products.length} productos registrados</span>
                <span className="portal-badge-active">{products.filter((p) => p.active).length} activos en tienda</span>
              </div>
              <div className="view-toggle" role="group" aria-label="Vista del catálogo">
                <button type="button" aria-pressed={view === "grid"} className={view === "grid" ? "on" : ""} onClick={() => changeView("grid")}><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M2 2h7v7H2zM11 2h7v7h-7zM2 11h7v7H2zM11 11h7v7h-7z" fill="currentColor" /></svg> Cuadrícula</button>
                <button type="button" aria-pressed={view === "list"} className={view === "list" ? "on" : ""} onClick={() => changeView("list")}><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M2 3h16v4H2zM2 9h16v4H2zM2 15h16v3H2z" fill="currentColor" /></svg> Filas</button>
              </div>
              <button type="button" className="portal-add" onClick={() => { setErrors({}); setForm(EMPTY_FORM); setModal(true); }}>
                + Nuevo producto
              </button>
            </div>

            {actionError && <p className="field-error" role="alert">{actionError}</p>}

            {loading ? (
              <div className="portal-empty-card" aria-busy="true"><p>Cargando el catálogo…</p></div>
            ) : error ? (
              <div className="portal-empty-card" role="alert">
                <p>{error}</p>
                <button type="button" className="button button-sm" onClick={() => void reload()}>Reintentar</button>
              </div>
            ) : products.length === 0 ? (
              <div className="portal-empty-card"><p>Aún no hay productos. Agrega el primero con “+ Nuevo producto”.</p></div>
            ) : (
            view === "grid" ? (
              <div className="admin-grid">
                {products.map((item) => (
                  <article className={`admin-card${item.active ? "" : " row-inactive"}`} key={item.id}>
                    <Thumb item={item} />
                    <div className="admin-card-body">
                      <strong>{item.name}</strong>
                      <span className="cell-sub">{item.category}{item.featured ? " · Destacado" : ""}</span>
                      <div className="admin-card-fields">
                        <label>Precio ref.<NumberCell label={`Precio de ${item.name}`} value={item.price} onCommit={(value) => update(item.id, { price: value })} /></label>
                        <label>Stock ref.<NumberCell label={`Stock de ${item.name}`} value={item.stock} onCommit={(value) => update(item.id, { stock: value })} /></label>
                      </div>
                      <span className="cell-sub">{formatPrice(item.price)}</span>
                      <div className="admin-card-actions">{visibility(item)}{actions(item)}</div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
            <div className="table-scroll">
              <table className="data-table catalog-table">
                <thead>
                  <tr><th>Producto</th><th>Precio ref.</th><th>Stock ref.</th><th>Visible</th><th><span className="sr-only">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {products.map((item) => (
                    <tr key={item.id} className={item.active ? "" : "row-inactive"}>
                      <td>
                        <div className="admin-product-cell">
                          <Thumb item={item} />
                          <div>
                            <strong>{item.name}</strong>
                            <span className="cell-sub">{item.category}{item.featured ? " · Destacado" : ""}{item.image ? "" : " · Sin imagen"}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <NumberCell label={`Precio de ${item.name}`} value={item.price} onCommit={(value) => update(item.id, { price: value })} />
                        <span className="cell-sub">{formatPrice(item.price)}</span>
                      </td>
                      <td>
                        <NumberCell label={`Stock de ${item.name}`} value={item.stock} onCommit={(value) => update(item.id, { stock: value })} />
                      </td>
                      <td>{visibility(item)}</td>
                      <td>{actions(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ))}
            <p className="table-note">{products.filter((item) => item.active).length} de {products.length} visibles en la tienda · Precios y stock referenciales.</p>
          </section>
        </div>
      </main>
      <InnerFooter />

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Nuevo producto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Nuevo producto</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setModal(false)}>×</button>
            </div>
            <form onSubmit={submit} noValidate>
              <label>Nombre *<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nombre del producto" autoComplete="off" />{errors.name && <small className="field-error">{errors.name}</small>}</label>
              <label>Descripción<textarea rows={2} value={form.text} onChange={(e) => set("text", e.target.value)} placeholder="Descripción breve" /></label>
              <div className="form-row">
                <label>Categoría<input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="MANTENCIÓN" autoComplete="off" /></label>

              </div>
              <ImageUpload value={form.image} onChange={(url) => { set("image", url); setErrors((cur) => ({ ...cur, image: undefined })); }} error={errors.image} />
              <div className="form-row">
                <label>Precio *<input type="number" min={0} step={1} value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="19990" inputMode="numeric" />{errors.price && <small className="field-error">{errors.price}</small>}</label>
                <label>Stock *<input type="number" min={0} step={1} value={form.stock} onChange={(e) => set("stock", e.target.value)} placeholder="10" inputMode="numeric" />{errors.stock && <small className="field-error">{errors.stock}</small>}</label>
              </div>
              <label className="check-row"><input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} /> Mostrar en Top ventas</label>
              {errors.form && <small className="field-error" role="alert">{errors.form}</small>}
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="button" disabled={saving}>{saving ? "Guardando…" : <>Agregar producto <span>↗</span></>}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {imageModal && (
        <div className="modal-overlay" onClick={() => setImageModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Imagen del producto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Imagen del producto</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setImageModal(null)}>×</button>
            </div>
            <ImageUpload value={imageModal.url} onChange={(url) => setImageModal((cur) => (cur ? { ...cur, url, error: "" } : cur))} error={imageModal.error} />
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setImageModal(null)}>Cancelar</button>
              <button type="button" className="button" disabled={imageModal.url === ""} onClick={() => void saveImage()}>Guardar imagen <span>↗</span></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
