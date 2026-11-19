"use client";

import { useCallback, useEffect, useState } from "react";

/** Elemento de la lista: `count` es cuántas cosas lo usan (productos, grúas…). */
export type ManagedItem = { id: string; name: string; count: number };

export type ListManagerConfig = {
  /** Título de la ventana, p. ej. «Categorías del catálogo». */
  title: string;
  /** «la categoría» / «el tipo», en minúsculas, para los textos. */
  itemLabel: { one: string; the: string; other: string };
  /** Lo que usa cada elemento, en singular y plural: «producto» / «productos». */
  countLabel: [string, string];
  newPlaceholder: string;
  maxLength: number;
  /** Nombre que no se puede quitar (el de respaldo). */
  locked?: string;
  load: () => Promise<ManagedItem[]>;
  create: (name: string) => Promise<unknown>;
  rename: (id: string, name: string) => Promise<unknown>;
  reorder: (ids: string[]) => Promise<unknown>;
  remove: (id: string, reassignTo?: string) => Promise<unknown>;
};

/**
 * Ventana para crear, renombrar, ordenar y quitar los elementos de una lista (categorías del catálogo, tipos de grúa).
 * Si un elemento está en uso, al quitarlo se elige a cuál pasan sus cosas.
 */
export default function ListManager({ config, onClose, onChanged }: { config: ListManagerConfig; onClose: () => void; onChanged: () => void }) {
  const { title, itemLabel, countLabel, newPlaceholder, maxLength, locked } = config;
  const plural = (n: number) => `${n} ${n === 1 ? countLabel[0] : countLabel[1]}`;
  const [items, setItems] = useState<ManagedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<{ item: ManagedItem; target: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await config.load());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la lista.");
    } finally {
      setLoading(false);
    }
  }, [config]);
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
    void run(async () => { await config.reorder(next.map((c) => c.id)); }, "No se pudo cambiar el orden.");
  }

  function askRemove(item: ManagedItem) {
    if (item.count === 0) {
      void run(async () => { await config.remove(item.id); }, `No se pudo quitar ${itemLabel.the}.`);
      return;
    }
    const other = items.find((c) => c.id !== item.id);
    if (!other) {
      setError(`Crea ${itemLabel.other} para poder mover ${countLabel[1]} de esta lista.`);
      return;
    }
    setRemoving({ item, target: other.id });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-close" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <form
          className="category-add"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() === "") return;
            void run(async () => {
              await config.create(name.trim());
              setName("");
            }, `No se pudo crear ${itemLabel.the}.`);
          }}
        >
          <input aria-label={`Nombre de ${itemLabel.one} nuevo`} value={name} onChange={(e) => setName(e.target.value)} placeholder={newPlaceholder} maxLength={maxLength} autoComplete="off" />
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
                        await config.rename(item.id, editing.name);
                        setEditing(null);
                      }, `No se pudo renombrar ${itemLabel.the}.`);
                    }}
                  >
                    <input aria-label={`Nuevo nombre de ${item.name}`} value={editing.name} onChange={(e) => setEditing({ id: item.id, name: e.target.value })} maxLength={maxLength} autoFocus />
                    <button type="submit" className="toggle-btn active" disabled={busy}>Guardar</button>
                    <button type="button" className="toggle-btn" onClick={() => setEditing(null)}>Cancelar</button>
                  </form>
                ) : (
                  <>
                    <span><strong>{item.name}</strong> <small className="cell-sub">{plural(item.count)}</small></span>
                    <span className="category-actions">
                      <button type="button" className="toggle-btn" aria-label={`Subir ${item.name}`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
                      <button type="button" className="toggle-btn" aria-label={`Bajar ${item.name}`} disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}>↓</button>
                      {item.name === locked ? (
                        <small className="cell-sub" title="Es el de respaldo: no se renombra ni se quita">De respaldo</small>
                      ) : (
                        <>
                          <button type="button" className="toggle-btn" onClick={() => setEditing({ id: item.id, name: item.name })}>Renombrar</button>
                          <button type="button" className="toggle-btn danger" disabled={busy} onClick={() => askRemove(item)}>Quitar</button>
                        </>
                      )}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {removing && (
          <div className="category-reassign" role="group" aria-label={`Reasignar ${countLabel[1]}`}>
            <p>«{removing.item.name}» tiene {plural(removing.item.count)}. ¿A cuál pasan?</p>
            <select aria-label="Destino" value={removing.target} onChange={(e) => setRemoving({ item: removing.item, target: e.target.value })}>
              {items.filter((c) => c.id !== removing.item.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setRemoving(null)}>Cancelar</button>
              <button
                type="button"
                className="button button-sm"
                disabled={busy}
                onClick={() => void run(async () => {
                  await config.remove(removing.item.id, removing.target);
                  setRemoving(null);
                }, `No se pudo quitar ${itemLabel.the}.`)}
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
