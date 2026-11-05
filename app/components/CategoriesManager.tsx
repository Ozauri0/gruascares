"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createCategory,
  deleteCategory,
  listAdminCategories,
  renameCategory,
  reorderCategories,
  type AdminCatalogCategory,
} from "../lib/catalog-categories-api";

/** Ventana para crear, renombrar, ordenar y quitar las categorías del catálogo (solo admin). */
export default function CategoriesManager({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<AdminCatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<{ item: AdminCatalogCategory; target: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await listAdminCategories());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las categorías.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<void>, failure: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: -1 | 1) {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    void run(() => reorderCategories(next.map((c) => c.id)), "No se pudo cambiar el orden.");
  }

  function askRemove(item: AdminCatalogCategory) {
    if (item.productCount === 0) {
      void run(() => deleteCategory(item.id), "No se pudo quitar la categoría.");
      return;
    }
    const other = items.find((c) => c.id !== item.id);
    if (!other) {
      setError("Crea otra categoría para poder mover los productos de esta.");
      return;
    }
    setRemoving({ item, target: other.id });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Categorías del catálogo" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Categorías del catálogo</h2>
          <button type="button" className="modal-close" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <form
          className="category-add"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() === "") return;
            void run(async () => {
              await createCategory(name.trim());
              setName("");
            }, "No se pudo crear la categoría.");
          }}
        >
          <input aria-label="Nombre de la nueva categoría" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" maxLength={100} autoComplete="off" />
          <button type="submit" className="button button-sm" disabled={busy}>Agregar</button>
        </form>
        {error && <small className="field-error" role="alert">{error}</small>}
        {loading ? (
          <p className="cell-sub">Cargando…</p>
        ) : (
          <ul className="category-list">
            {items.map((item, index) => (
              <li key={item.id}>
                {editing?.id === item.id ? (
                  <form
                    className="category-add"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        await renameCategory(item.id, editing.name);
                        setEditing(null);
                      }, "No se pudo renombrar la categoría.");
                    }}
                  >
                    <input aria-label={`Nuevo nombre de ${item.name}`} value={editing.name} onChange={(e) => setEditing({ id: item.id, name: e.target.value })} maxLength={100} autoFocus />
                    <button type="submit" className="toggle-btn active" disabled={busy}>Guardar</button>
                    <button type="button" className="toggle-btn" onClick={() => setEditing(null)}>Cancelar</button>
                  </form>
                ) : (
                  <>
                    <span><strong>{item.name}</strong> <small className="cell-sub">{item.productCount} {item.productCount === 1 ? "producto" : "productos"}</small></span>
                    <span className="category-actions">
                      <button type="button" className="toggle-btn" aria-label={`Subir ${item.name}`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
                      <button type="button" className="toggle-btn" aria-label={`Bajar ${item.name}`} disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}>↓</button>
                      <button type="button" className="toggle-btn" onClick={() => setEditing({ id: item.id, name: item.name })}>Renombrar</button>
                      <button type="button" className="toggle-btn danger" disabled={busy} onClick={() => askRemove(item)}>Quitar</button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {removing && (
          <div className="category-reassign" role="group" aria-label="Reasignar productos">
            <p>«{removing.item.name}» tiene {removing.item.productCount} {removing.item.productCount === 1 ? "producto" : "productos"}. ¿A qué categoría pasan?</p>
            <select aria-label="Categoría de destino" value={removing.target} onChange={(e) => setRemoving({ item: removing.item, target: e.target.value })}>
              {items.filter((c) => c.id !== removing.item.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setRemoving(null)}>Cancelar</button>
              <button
                type="button"
                className="button button-sm"
                disabled={busy}
                onClick={() => void run(async () => {
                  await deleteCategory(removing.item.id, removing.target);
                  setRemoving(null);
                }, "No se pudo quitar la categoría.")}
              >
                Mover y quitar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
