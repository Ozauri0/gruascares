"use client";

import { useCallback, useEffect, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import Skeleton from "../../components/Skeleton";
import AdminNav from "../components/AdminNav";
import { formatPrice } from "../../lib/catalog";
import {
  createService,
  deleteService,
  listAdminServices,
  SERVICE_CATEGORY_LABEL,
  updateService,
  type AdminService,
  type ServiceCategory,
} from "../../lib/services-api";

type Form = { id: string | null; category: ServiceCategory; name: string; description: string; basePrice: string; duration: string; isActive: boolean };
const EMPTY: Form = { id: null, category: "serviteca", name: "", description: "", basePrice: "", duration: "60", isActive: true };

export default function ServicesAdminPage() {
  const [services, setServices] = useState<AdminService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setServices(await listAdminServices());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los servicios.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  function edit(service: AdminService) {
    setFormError("");
    setForm({
      id: service.id,
      category: service.category,
      name: service.name,
      description: service.description ?? "",
      basePrice: String(service.basePrice),
      duration: String(service.estimatedDurationMin),
      isActive: service.isActive,
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form || saving) return;
    const basePrice = Number(form.basePrice);
    const duration = Number(form.duration);
    if (form.name.trim().length < 3) return setFormError("El nombre es obligatorio (mínimo 3 caracteres).");
    if (form.basePrice.trim() === "" || !Number.isInteger(basePrice) || basePrice < 0) return setFormError("El precio base debe ser un número entero.");
    if (!Number.isInteger(duration) || duration < 5 || duration > 1440) return setFormError("La duración debe ser de 5 a 1440 minutos.");
    setSaving(true);
    setFormError("");
    const input = {
      category: form.category,
      name: form.name.trim(),
      description: form.description.trim() === "" ? null : form.description.trim(),
      basePrice,
      estimatedDurationMin: duration,
      isActive: form.isActive,
    };
    try {
      const saved = form.id ? await updateService(form.id, input) : await createService(input);
      setServices((current) => (form.id ? current.map((s) => (s.id === saved.id ? saved : s)) : [...current, saved]));
      setForm(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar el servicio.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(service: AdminService) {
    setActionError("");
    try {
      const saved = await updateService(service.id, { isActive: !service.isActive });
      setServices((current) => current.map((s) => (s.id === saved.id ? saved : s)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo guardar el cambio.");
    }
  }

  async function remove(service: AdminService) {
    if (confirmDelete !== service.id) return setConfirmDelete(service.id);
    setConfirmDelete(null);
    setActionError("");
    try {
      await deleteService(service.id);
      setServices((current) => current.filter((s) => s.id !== service.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo eliminar el servicio.");
    }
  }

  const set = <K extends keyof Form>(field: K, value: Form[K]) => setForm((current) => (current ? { ...current, [field]: value } : current));
  const groups = (["serviteca", "grua"] as const).map((category) => ({ category, items: services.filter((s) => s.category === category) }));

  return (
    <>
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Servicios de <em>agenda.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Crea, edita y oculta los servicios que los clientes pueden solicitar en «Agendar». Los desactivados no se muestran, pero sus citas se conservan.</p>
          </div>
        </section>

        <div className="portal-stack wrap">
          <AdminNav current="servicios" />
          <section aria-label="Gestión de servicios">
            <div className="portal-toolbar">
              <div className="portal-toolbar-left">
                <span className="portal-badge-counter">{services.length} servicios</span>
                <span className="portal-badge-active">{services.filter((s) => s.isActive).length} activos en «Agendar»</span>
              </div>
              <button type="button" className="portal-add" onClick={() => { setFormError(""); setForm(EMPTY); }}>+ Nuevo servicio</button>
            </div>

            {actionError && <p className="field-error" role="alert">{actionError}</p>}

            {loading ? (
              <Skeleton label="Cargando los servicios…" />
            ) : error ? (
              <div className="portal-empty-card" role="alert">
                <p>{error}</p>
                <button type="button" className="button button-sm" onClick={() => void reload()}>Reintentar</button>
              </div>
            ) : (
              groups.map(({ category, items }) => (
                <div key={category} className="service-group">
                  <h2 className="service-group-title">{SERVICE_CATEGORY_LABEL[category]}</h2>
                  {items.length === 0 ? (
                    <div className="portal-empty-card"><p>Aún no hay servicios en esta categoría.</p></div>
                  ) : (
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr><th>Servicio</th><th>Precio base</th><th>Duración</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr>
                        </thead>
                        <tbody>
                          {items.map((service) => (
                            <tr key={service.id} className={service.isActive ? "" : "row-inactive"}>
                              <td>
                                <strong>{service.name}</strong>
                                {service.description && <span className="cell-sub">{service.description}</span>}
                                <span className="cell-sub">{service.appointmentCount} {service.appointmentCount === 1 ? "cita" : "citas"}</span>
                              </td>
                              <td>{formatPrice(service.basePrice)}</td>
                              <td>{service.estimatedDurationMin} min</td>
                              <td>{service.isActive ? "Activo" : "Oculto"}</td>
                              <td>
                                <button type="button" className="toggle-btn" onClick={() => edit(service)}>Editar</button>{" "}
                                <button type="button" className="toggle-btn" onClick={() => void toggle(service)}>{service.isActive ? "Desactivar" : "Activar"}</button>{" "}
                                {service.appointmentCount === 0 && (
                                  <button type="button" className={confirmDelete === service.id ? "toggle-btn danger confirm" : "toggle-btn danger"} onClick={() => void remove(service)} onBlur={() => setConfirmDelete(null)}>
                                    {confirmDelete === service.id ? "Confirmar" : "Eliminar"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
            <p className="table-note">El precio base es referencial. Un servicio con citas no se borra: se desactiva.</p>
          </section>
        </div>
      </main>
      <InnerFooter />

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={form.id ? "Editar servicio" : "Nuevo servicio"} onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>{form.id ? "Editar servicio" : "Nuevo servicio"}</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setForm(null)}>×</button>
            </div>
            <form onSubmit={submit} noValidate>
              <label>Categoría *
                <select value={form.category} onChange={(e) => set("category", e.target.value as ServiceCategory)}>
                  <option value="serviteca">{SERVICE_CATEGORY_LABEL.serviteca}</option>
                  <option value="grua">{SERVICE_CATEGORY_LABEL.grua}</option>
                </select>
              </label>
              <label>Nombre *<input value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" maxLength={255} /></label>
              <label>Descripción<textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={1000} /></label>
              <div className="form-row">
                <label>Precio base (CLP) *<input type="number" min={0} step={1} inputMode="numeric" value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} /></label>
                <label>Duración estimada (min) *<input type="number" min={5} max={1440} step={5} inputMode="numeric" value={form.duration} onChange={(e) => set("duration", e.target.value)} /></label>
              </div>
              <label className="check-row"><input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Visible en «Agendar»</label>
              {formError && <small className="field-error" role="alert">{formError}</small>}
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setForm(null)}>Cancelar</button>
                <button type="submit" className="button" disabled={saving}>{saving ? "Guardando…" : form.id ? "Guardar cambios" : "Crear servicio"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
