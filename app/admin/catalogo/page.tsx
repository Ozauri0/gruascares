"use client";

import { useEffect, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import { DEFAULT_PRODUCTS, formatPrice, loadCatalog, saveCatalog } from "../../lib/catalog";
import type { Product, ProductArt } from "../../lib/catalog";

type ProductForm = { name: string; text: string; category: string; price: string; stock: string; art: ProductArt; featured: boolean };

const EMPTY_FORM: ProductForm = { name: "", text: "", category: "MANTENCIÓN", price: "", stock: "", art: "oil", featured: false };

export default function CatalogAdminPage() {
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [hydrated, setHydrated] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<{ name?: string; price?: string; stock?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [imageModal, setImageModal] = useState<{ id: string; url: string; error: string } | null>(null);

  useEffect(() => {
    setProducts(loadCatalog());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveCatalog(products);
  }, [products, hydrated]);

  function patch(id: string, data: Partial<Product>) {
    setProducts((current) => current.map((item) => (item.id === id ? { ...item, ...data } : item)));
  }

  function remove(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setProducts((current) => current.filter((item) => item.id !== id));
    setConfirmDelete(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = "El nombre es obligatorio.";
    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!Number.isInteger(price) || price < 0) next.price = "Precio inválido.";
    if (!Number.isInteger(stock) || stock < 0) next.stock = "Stock inválido.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setProducts((current) => [
      ...current,
      {
        id: `p-${Date.now()}`,
        name: form.name.trim(),
        text: form.text.trim() === "" ? "Producto del catálogo Grúas Cares." : form.text.trim(),
        category: form.category.trim() === "" ? "GENERAL" : form.category.trim().toUpperCase(),
        price,
        stock,
        tag: null,
        art: form.art,
        image: null,
        featured: form.featured,
        active: true,
      },
    ]);
    setModal(false);
    setForm(EMPTY_FORM);
  }

  function set(field: keyof ProductForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openImage(item: Product) {
    setImageModal({ id: item.id, url: item.image?.startsWith("data:") ? "" : item.image ?? "", error: "" });
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageModal((current) => (current ? { ...current, error: "El archivo debe ser una imagen." } : current));
      return;
    }
    if (file.size > 700 * 1024) {
      setImageModal((current) => (current ? { ...current, error: "Máximo 700 KB para guardar en el mockup (usa una URL para imágenes pesadas)." } : current));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setImageModal((current) => (current ? { ...current, url: result, error: "" } : current));
    };
    reader.readAsDataURL(file);
  }

  function saveImage() {
    if (!imageModal) return;
    const url = imageModal.url.trim();
    patch(imageModal.id, { image: url === "" ? null : url });
    setImageModal(null);
  }

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Catálogo y <em>precios.</em></h1>
          </div>
          <p>Edita precios, stock y visibilidad de la tienda. Los cambios se reflejan de inmediato en /catalogo.</p>
        </section>

        <div className="portal-stack wrap">
          <section aria-label="Gestión del catálogo">
            <div className="portal-toolbar">
              <a className="portal-back" href="/admin">← Volver al panel</a>
              <button type="button" className="portal-add" onClick={() => { setErrors({}); setForm(EMPTY_FORM); setModal(true); }}>+ Nuevo producto</button>
            </div>

            <div className="table-scroll">
              <table className="data-table catalog-table">
                <thead>
                  <tr><th>Producto</th><th>Precio ref.</th><th>Stock ref.</th><th>Visible</th><th><span className="sr-only">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {products.map((item) => (
                    <tr key={item.id} className={item.active ? "" : "row-inactive"}>
                      <td>
                        <strong>{item.name}</strong>
                        <span className="cell-sub">{item.category}{item.featured ? " · Destacado" : ""}{item.image ? " · Con imagen" : " · Arte automático"}</span>
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          type="number"
                          min={0}
                          step={1}
                          aria-label={`Precio de ${item.name}`}
                          value={item.price}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isInteger(value) && value >= 0) patch(item.id, { price: value });
                          }}
                        />
                        <span className="cell-sub">{formatPrice(item.price)}</span>
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          type="number"
                          min={0}
                          step={1}
                          aria-label={`Stock de ${item.name}`}
                          value={item.stock}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isInteger(value) && value >= 0) patch(item.id, { stock: value });
                          }}
                        />
                      </td>
                      <td>
                        <button type="button" className="toggle-btn" onClick={() => patch(item.id, { active: !item.active })}>
                          {item.active ? "Ocultar" : "Mostrar"}
                        </button>
                      </td>
                      <td>
                        <button type="button" className="toggle-btn" onClick={() => openImage(item)}>
                          Imagen
                        </button>
                        <button
                          type="button"
                          className={confirmDelete === item.id ? "toggle-btn danger confirm" : "toggle-btn danger"}
                          onClick={() => remove(item.id)}
                          onBlur={() => setConfirmDelete(null)}
                        >
                          {confirmDelete === item.id ? "Confirmar" : "Eliminar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                <label>Visual<select value={form.art} onChange={(e) => set("art", e.target.value)}><option value="oil">Aceite</option><option value="tyre">Neumático</option><option value="battery">Batería</option></select></label>
              </div>
              <div className="form-row">
                <label>Precio *<input type="number" min={0} step={1} value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="19990" inputMode="numeric" />{errors.price && <small className="field-error">{errors.price}</small>}</label>
                <label>Stock *<input type="number" min={0} step={1} value={form.stock} onChange={(e) => set("stock", e.target.value)} placeholder="10" inputMode="numeric" />{errors.stock && <small className="field-error">{errors.stock}</small>}</label>
              </div>
              <label className="check-row"><input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} /> Mostrar en Top ventas</label>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="button">Agregar producto <span>↗</span></button>
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
            <label>URL de imagen<input value={imageModal.url} onChange={(e) => setImageModal({ ...imageModal, url: e.target.value, error: "" })} placeholder="https://…" autoComplete="off" /></label>
            <div className="image-row">
              <label className="file-btn">Subir archivo<input type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} /></label>
              <button type="button" className="modal-cancel" onClick={() => setImageModal({ ...imageModal, url: "" })}>Usar arte automático</button>
            </div>
            {imageModal.error !== "" && <small className="field-error">{imageModal.error}</small>}
            {imageModal.url.trim() !== "" && <div className="image-preview"><img src={imageModal.url} alt="Vista previa del producto" /></div>}
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setImageModal(null)}>Cancelar</button>
              <button type="button" className="button" onClick={saveImage}>Guardar imagen <span>↗</span></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
