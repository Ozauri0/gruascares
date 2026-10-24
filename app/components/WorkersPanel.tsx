"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { rolesOf } from "../lib/route-guard";
import { formatRut, isValidRut, whatsappUrl } from "../lib/rut";
import { WORK_AREAS, type WorkArea } from "../lib/work-areas";
import {
  WORKER_TYPE_FOR_AREA,
  WORKER_TYPE_LABEL,
  createWorker,
  listWorkers,
  updateWorker,
  type Worker,
  type WorkerType,
} from "../lib/workers-api";
import Skeleton from "./Skeleton";

type Form = { name: string; rut: string; phone: string; types: WorkerType[] };

/** Tipos de trabajador que puede registrar esta cuenta: el jefe de taller, mecánicos; el de grúas, grueros; el admin, ambos. */
function manageableTypes(roles: string[]): WorkerType[] {
  if (roles.includes("admin")) return ["mecanico", "gruero"];
  const types: WorkerType[] = [];
  if (roles.includes("mecanico")) types.push("mecanico");
  if (roles.includes("grua")) types.push("gruero");
  return types;
}

/**
 * Equipo del área: los trabajadores no tienen cuenta; el jefe los registra aquí para poder asignarles las solicitudes.
 * `onChange` avisa al tablero para que refresque el selector de «quién se encarga».
 */
export default function WorkersPanel({ area, onChange }: { area: WorkArea; onChange: () => void }) {
  const { user } = useAuth();
  const copy = WORK_AREAS[area];
  const mine = user ? manageableTypes(rolesOf(user)) : [];
  const areaType = WORKER_TYPE_FOR_AREA[area];

  const [open, setOpen] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Worker | "new" | null>(null);
  const [form, setForm] = useState<Form>({ name: "", rut: "", phone: "", types: [areaType] });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    listWorkers(controller.signal, area)
      .then((list) => {
        setWorkers(list);
        setError("");
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setWorkers([]);
        setError(err instanceof Error ? err.message : "No se pudo cargar el equipo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, area, nonce]);

  const refresh = useCallback(() => {
    setNonce((n) => n + 1);
    onChange();
  }, [onChange]);

  function openForm(worker: Worker | "new") {
    setFormError("");
    setForm(
      worker === "new"
        ? { name: "", rut: "", phone: "", types: [areaType] }
        : { name: worker.name, rut: formatRut(worker.rut), phone: worker.phone ?? "", types: worker.types }
    );
    setEditing(worker);
  }

  function toggleType(type: WorkerType) {
    setForm((current) => ({
      ...current,
      types: current.types.includes(type) ? current.types.filter((t) => t !== type) : [...current.types, type],
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !editing) return;
    if (form.name.trim().length < 2) return setFormError("Ingresa el nombre del trabajador.");
    if (!isValidRut(form.rut)) return setFormError("Ingresa un RUT chileno válido (ej. 12.345.678-5).");
    if (form.types.length === 0) return setFormError("Marca al menos un tipo de trabajador.");
    setSaving(true);
    setFormError("");
    try {
      const input = { name: form.name.trim(), rut: formatRut(form.rut), phone: form.phone.trim(), types: form.types };
      if (editing === "new") await createWorker(input);
      else await updateWorker(editing.id, input);
      setEditing(null);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar el trabajador.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(worker: Worker) {
    setError("");
    try {
      await updateWorker(worker.id, { isActive: !worker.isActive });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado del trabajador.");
    }
  }

  return (
    <section className="workers-panel" aria-label={copy.workersTitle}>
      <div className="portal-toolbar">
        <div className="portal-toolbar-left">
          <h2 className="pending-title">{copy.workersTitle}</h2>
          <span className="portal-badge-counter">Personal sin cuenta · lo asignas a cada solicitud</span>
        </div>
        <button type="button" className="toggle-btn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? "Ocultar equipo" : "Gestionar equipo"}
        </button>
      </div>

      {open && (
        <>
          <div className="portal-toolbar">
            <p className="portal-subtext">Registra a quienes hacen los trabajos (no necesitan correo ni contraseña). Si das de baja a alguien, su historial se conserva.</p>
            <button type="button" className="portal-add" onClick={() => openForm("new")}>+ Agregar {copy.workerNoun}</button>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          {loading ? (
            <Skeleton label="Cargando el equipo…" rows={2} />
          ) : workers.length === 0 ? (
            <p className="portal-empty">Aún no hay {copy.workerNoun}s registrados.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Nombre / RUT</th><th>Teléfono</th><th>Tipo</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {workers.map((worker) => {
                    const wa = whatsappUrl(worker.phone);
                    const canEdit = worker.types.some((t) => mine.includes(t));
                    return (
                      <tr key={worker.id} className={worker.isActive ? "" : "row-inactive"}>
                        <td><strong>{worker.name}</strong><br /><span className="cell-sub">{formatRut(worker.rut)}</span></td>
                        <td>
                          {worker.phone ? (
                            <span className="cell-sub">
                              <a href={`tel:${worker.phone}`}>{worker.phone}</a>
                              {wa && <>{" · "}<a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
                            </span>
                          ) : <span className="cell-sub">—</span>}
                        </td>
                        <td><span className="role-badges">{worker.types.map((t) => <span key={t} className="role-badge role-mecanico">{WORKER_TYPE_LABEL[t]}</span>)}</span></td>
                        <td><span className={worker.isActive ? "state-on" : "state-off"}>{worker.isActive ? "Activo" : "De baja"}</span></td>
                        <td>
                          {canEdit && (
                            <>
                              <button type="button" className="toggle-btn" onClick={() => openForm(worker)}>Editar</button>{" "}
                              <button type="button" className="toggle-btn" onClick={() => void toggleActive(worker)}>{worker.isActive ? "Dar de baja" : "Reactivar"}</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={editing === "new" ? `Nuevo ${copy.workerNoun}` : "Editar trabajador"} onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>{editing === "new" ? `Nuevo ${copy.workerNoun}` : "Editar trabajador"}</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setEditing(null)}>×</button>
            </div>
            <form onSubmit={submit} noValidate>
              <div className="form-row">
                <label>Nombre completo *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre y apellido" autoComplete="off" /></label>
                <label>RUT *<input value={form.rut} onChange={(e) => setForm({ ...form, rut: e.target.value })} onBlur={() => { if (isValidRut(form.rut)) setForm((c) => ({ ...c, rut: formatRut(c.rut) })); }} placeholder="12.345.678-5" autoComplete="off" /></label>
              </div>
              <div className="form-row">
                <label>Teléfono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+56 9 ..." autoComplete="off" /></label>
              </div>
              <fieldset className="role-picker">
                <legend>Tipo de trabajador</legend>
                {(["mecanico", "gruero"] as WorkerType[]).map((type) => {
                  const allowed = mine.includes(type);
                  return (
                    <label key={type} className="role-option">
                      <input type="checkbox" checked={form.types.includes(type)} disabled={!allowed} onChange={() => toggleType(type)} />
                      <span>{WORKER_TYPE_LABEL[type]}{!allowed && " (otra área)"}</span>
                    </label>
                  );
                })}
              </fieldset>
              {formError && <small className="field-error" role="alert">{formError}</small>}
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setEditing(null)}>Cancelar</button>
                <button type="submit" className="button" disabled={saving}>{saving ? "Guardando…" : <>Guardar <span>↗</span></>}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
