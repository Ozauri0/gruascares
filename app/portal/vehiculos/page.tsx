"use client";

import { useEffect, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import { MOCK_VEHICLES } from "../../lib/portal-mocks";
import type { PortalVehicle } from "../../lib/portal-types";
import { formatPlate, isValidChileanPlate, normalizePlate } from "../../lib/plate";

const STORAGE_KEY = "gruas-cares-vehicles";
const CURRENT_YEAR = new Date().getFullYear();

type FormState = { plate: string; brand: string; model: string; year: string; mileage: string };
const EMPTY_FORM: FormState = { plate: "", brand: "", model: "", year: "", mileage: "" };

function loadVehicles(): PortalVehicle[] {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as PortalVehicle[];
  } catch {
    // Si el respaldo local falla, se usan los datos demostrativos.
  }
  return MOCK_VEHICLES;
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<PortalVehicle[]>(MOCK_VEHICLES);
  const [hydrated, setHydrated] = useState(false);
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; id: string } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    setVehicles(loadVehicles());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
  }, [vehicles, hydrated]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setErrors({});
    setModal({ mode: "create" });
  }

  function openEdit(vehicle: PortalVehicle) {
    setForm({
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year ? String(vehicle.year) : "",
      mileage: vehicle.mileage ? String(vehicle.mileage) : "",
    });
    setErrors({});
    setModal({ mode: "edit", id: vehicle.id });
  }

  function validate(): boolean {
    const next: Partial<FormState> = {};
    const plate = normalizePlate(form.plate);
    if (!isValidChileanPlate(form.plate)) {
      next.plate = "Ingresa una patente válida (ej. ABCD·12 o AB·1234).";
    } else if (
      vehicles.some((v) => v.plate === plate && !(modal?.mode === "edit" && v.id === modal.id))
    ) {
      next.plate = "Esa patente ya está registrada.";
    }
    if (form.brand.trim().length < 2) next.brand = "La marca es obligatoria.";
    if (form.model.trim().length < 1) next.model = "El modelo es obligatorio.";
    if (form.year.trim() !== "") {
      const year = Number(form.year);
      if (!Number.isInteger(year) || year < 1950 || year > CURRENT_YEAR + 1) {
        next.year = `Año entre 1950 y ${CURRENT_YEAR + 1}.`;
      }
    }
    if (form.mileage.trim() !== "") {
      const mileage = Number(form.mileage);
      if (!Number.isInteger(mileage) || mileage < 0) next.mileage = "Kilometraje inválido.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    const data = {
      plate: normalizePlate(form.plate),
      brand: form.brand.trim(),
      model: form.model.trim(),
      year: form.year.trim() === "" ? null : Number(form.year),
      mileage: form.mileage.trim() === "" ? 0 : Number(form.mileage),
    };
    if (modal?.mode === "edit") {
      setVehicles((current) => current.map((v) => (v.id === modal.id ? { ...v, ...data } : v)));
    } else {
      setVehicles((current) => [...current, { ...data, id: `v-${Date.now()}` }]);
    }
    setModal(null);
  }

  function remove(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setVehicles((current) => current.filter((v) => v.id !== id));
    setConfirmDelete(null);
  }

  function set(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Mi Cuenta</p>
            <h1>Mis <em>vehículos.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Registra tus autos, camionetas o camiones para agendar más rápido y llevar su historial de atenciones.</p>
          </div>
        </section>

        <div className="portal-stack wrap">
          {/* Navegación del portal */}
          <nav className="portal-nav-tabs" aria-label="Secciones del portal">
            <a href="/portal" className="portal-nav-tab">
              <span className="tab-icon">🏠</span>
              <span>Mi Resumen</span>
            </a>
            <a href="/portal/citas" className="portal-nav-tab">
              <span className="tab-icon">📋</span>
              <span>Mis Citas</span>
            </a>
            <a href="/portal/vehiculos" className="portal-nav-tab active">
              <span className="tab-icon">🚗</span>
              <span>Mis Vehículos</span>
              <span className="tab-pill">{vehicles.length}</span>
            </a>
            <a href="/agendar" className="portal-nav-tab portal-nav-cta">
              <span className="tab-icon">➕</span>
              <span>Agendar Nuevo</span>
            </a>
          </nav>

          <section className="portal-section">
            <div className="portal-toolbar">
              <div className="portal-toolbar-left">
                <span className="portal-badge-counter">{vehicles.length} {vehicles.length === 1 ? "vehículo registrado" : "vehículos registrados"}</span>
              </div>
              <button type="button" className="portal-add" onClick={openCreate}>
                + Registrar nuevo vehículo
              </button>
            </div>

            {vehicles.length === 0 ? (
              <div className="portal-empty-card">
                <p>Aún no tienes vehículos guardados en tu perfil.</p>
                <button type="button" className="button button-sm" onClick={openCreate}>+ Registrar mi primer vehículo</button>
              </div>
            ) : (
              <div className="vehicle-grid">
                {vehicles.map((vehicle) => (
                  <article className="vehicle-card" key={vehicle.id}>
                    <div className="vehicle-plate">{formatPlate(vehicle.plate)}</div>
                    <h3>{vehicle.brand} {vehicle.model}</h3>
                    <p className="vehicle-specs">
                      {vehicle.year ? `Año ${vehicle.year}` : "Año no informado"} · {vehicle.mileage.toLocaleString("es-CL")} km
                    </p>
                    <div className="vehicle-actions">
                      <button type="button" onClick={() => openEdit(vehicle)}>✏️ Editar datos</button>
                      <button
                        type="button"
                        className={confirmDelete === vehicle.id ? "danger confirm" : "danger"}
                        onClick={() => remove(vehicle.id)}
                        onBlur={() => setConfirmDelete(null)}
                      >
                        {confirmDelete === vehicle.id ? "Confirmar eliminación" : "Eliminar"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <InnerFooter />

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal.mode === "edit" ? "Editar vehículo" : "Agregar vehículo"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2>{modal.mode === "edit" ? "Editar vehículo" : "Agregar vehículo"}</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setModal(null)}>×</button>
            </div>
            <form onSubmit={submit} noValidate>
              <label>Patente *<input value={form.plate} onChange={(e) => set("plate", e.target.value)} placeholder="ABCD12" autoComplete="off" />{errors.plate && <small className="field-error">{errors.plate}</small>}</label>
              <div className="form-row">
                <label>Marca *<input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Toyota" autoComplete="off" />{errors.brand && <small className="field-error">{errors.brand}</small>}</label>
                <label>Modelo *<input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Hilux" autoComplete="off" />{errors.model && <small className="field-error">{errors.model}</small>}</label>
              </div>
              <div className="form-row">
                <label>Año<input value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="2021" inputMode="numeric" autoComplete="off" />{errors.year && <small className="field-error">{errors.year}</small>}</label>
                <label>Kilometraje<input value={form.mileage} onChange={(e) => set("mileage", e.target.value)} placeholder="80000" inputMode="numeric" autoComplete="off" />{errors.mileage && <small className="field-error">{errors.mileage}</small>}</label>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setModal(null)}>Cancelar</button>
                <button type="submit" className="button">{modal.mode === "edit" ? "Guardar cambios" : "Agregar vehículo"} <span>↗</span></button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
