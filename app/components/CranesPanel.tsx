"use client";

import { useEffect, useState } from "react";
import { createCrane, listCraneTypes, listCranes, unassignedCount, updateCrane, type Crane, type CraneType } from "../lib/cranes-api";
import { formatPlate } from "../lib/plate";
import { listWorkers, type Worker } from "../lib/workers-api";
import CraneTypesManager from "./CraneTypesManager";
import Skeleton from "./Skeleton";

type Form = { name: string; plate: string; type: string; notes: string; workerId: string };
const EMPTY: Form = { name: "", plate: "", type: "Plataforma hidráulica", notes: "", workerId: "" };


/** Flota de grúas: se registran las grúas y se asigna el gruero a cargo de cada una. */
export default function CranesPanel() {
  const [cranes, setCranes] = useState<Crane[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [types, setTypes] = useState<CraneType[]>([]);
  const [manageTypes, setManageTypes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Crane | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([listCranes(controller.signal), listWorkers(controller.signal, "grua", true), listCraneTypes(controller.signal)])
      .then(([fleet, team, kinds]) => {
        setCranes(fleet);
        setWorkers(team);
        setTypes(kinds);
        setError("");
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "No se pudo cargar la flota.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [nonce]);

  const refresh = () => setNonce((n) => n + 1);

  function openForm(crane: Crane | "new") {
    setFormError("");
    setForm(crane === "new" ? EMPTY : { name: crane.name, plate: formatPlate(crane.plate), type: crane.type, notes: crane.notes ?? "", workerId: crane.workerId ?? "" });
    setEditing(crane);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !editing) return;
    if (form.name.trim().length < 2) return setFormError("Ingresa el nombre o alias de la grúa.");
    if (form.plate.replace(/[^a-z0-9]/gi, "").length < 6) return setFormError("Ingresa la patente (ej. ABCD·12).");
    setSaving(true);
    setFormError("");
    try {
      const base = { name: form.name.trim(), plate: form.plate, type: form.type, notes: form.notes.trim() };
      if (editing === "new") await createCrane({ ...base, workerId: form.workerId || null });
      else await updateCrane(editing.id, { ...base, workerId: form.workerId || null });
      setEditing(null);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar la grúa.");
    } finally {
      setSaving(false);
    }
  }

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError("");
    try {
      await action();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    }
  }

  const pending = unassignedCount(cranes);

  return (
    <section className="workers-panel" aria-label="Flota de grúas">
      <div className="portal-toolbar">
        <div className="portal-toolbar-left">
          <span className="portal-badge-counter">{cranes.filter((c) => c.isActive).length} grúas activas</span>
          {pending > 0 && <span className="portal-badge-active">{pending} sin conductor a cargo</span>}
        </div>
        <span className="crane-toolbar-actions">
          <button type="button" className="toggle-btn" onClick={() => setManageTypes(true)}>Tipos de grúa</button>
          <button type="button" className="portal-add" onClick={() => openForm("new")}>+ Agregar grúa</button>
        </span>
      </div>
      <p className="portal-subtext">Registra las grúas de la empresa y elige quién queda a cargo de cada una. Los conductores se registran en «Gestionar personal». Si das de baja una grúa, se conserva en el sistema.</p>
      {error && <p className="field-error" role="alert">{error}</p>}

      {loading ? (
        <Skeleton label="Cargando la flota…" rows={3} />
      ) : cranes.length === 0 ? (
        <p className="portal-empty">Aún no hay grúas registradas.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Grúa</th><th>Tipo</th><th>Conductor a cargo</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr>
            </thead>
            <tbody>
              {cranes.map((crane) => (
                <tr key={crane.id} className={crane.isActive ? "" : "row-inactive"}>
                  <td>
                    <strong>{crane.name}</strong><br />
                    <span className="cell-sub">{formatPlate(crane.plate)}{crane.notes ? ` · ${crane.notes}` : ""}</span>
                  </td>
                  <td>{crane.type}</td>
                  <td>
                    <select
                      aria-label={`Conductor a cargo de ${crane.name}`}
                      value={crane.workerId ?? ""}
                      disabled={!crane.isActive}
                      onChange={(e) => void run(() => updateCrane(crane.id, { workerId: e.target.value || null }), "No se pudo asignar al conductor.")}
                    >
                      <option value="">Sin asignar</option>
                      {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      {/* quien ya estaba a cargo se mantiene visible aunque lo hayan dado de baja */}
                      {crane.workerId && !workers.some((w) => w.id === crane.workerId) && <option value={crane.workerId}>{crane.workerName ?? "Conductor"} (de baja)</option>}
                    </select>
                  </td>
                  <td><span className={crane.isActive ? "state-on" : "state-off"}>{crane.isActive ? "Activa" : "De baja"}</span></td>
                  <td>
                    <button type="button" className="toggle-btn" onClick={() => openForm(crane)}>Editar</button>{" "}
                    <button type="button" className="toggle-btn" onClick={() => void run(() => updateCrane(crane.id, { isActive: !crane.isActive }), "No se pudo cambiar el estado de la grúa.")}>{crane.isActive ? "Dar de baja" : "Reactivar"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={editing === "new" ? "Nueva grúa" : "Editar grúa"} onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>{editing === "new" ? "Nueva grúa" : "Editar grúa"}</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setEditing(null)}>×</button>
            </div>
            <form onSubmit={submit} noValidate>
              <div className="form-row">
                <label>Nombre o alias *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Grúa 1" autoComplete="off" /></label>
                <label>Patente *<input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABCD·12" autoComplete="off" /></label>
              </div>
              <div className="form-row">
                <label>
                  Tipo
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {types.map((type) => <option key={type.id} value={type.name}>{type.name}</option>)}
                    {/* el tipo guardado se mantiene visible aunque no esté en la lista */}
                    {form.type && !types.some((type) => type.name === form.type) && <option value={form.type}>{form.type}</option>}
                  </select>
                  <small className="cell-sub">¿Falta uno? Agrégalo en «Tipos de grúa».</small>
                </label>
                <label>
                  Conductor a cargo
                  <select value={form.workerId} onChange={(e) => setForm({ ...form, workerId: e.target.value })}>
                    <option value="">Sin asignar</option>
                    {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </label>
              </div>
              <label>Notas<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Capacidad, revisión técnica, etc." autoComplete="off" /></label>
              {formError && <small className="field-error" role="alert">{formError}</small>}
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setEditing(null)}>Cancelar</button>
                <button type="submit" className="button" disabled={saving}>{saving ? "Guardando…" : <>Guardar <span>↗</span></>}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {manageTypes && <CraneTypesManager onClose={() => setManageTypes(false)} onChanged={refresh} />}
    </section>
  );
}
