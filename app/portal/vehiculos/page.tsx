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
            <p className="eyebrow">Portal de clientes</p>
            <h1>Mis <em>vehículos.</em></h1>
          </div>
          <p>Registra tus autos, camionetas o camiones para agendar más rápido y llevar su historial de atenciones.</p>
        </section>

        <section className="portal-section wrap">
          <div className="portal-toolbar">
            <a className="portal-back" href="/portal">← Volver al portal</a>
            <button type="button" className="portal-add" onClick={openCreate}>+ Agregar vehículo</button>
          </div>

          {vehicles.length === 0 ? (
            <p className="portal-empty">Aún no registras vehículos. Agrega el primero para empezar.</p>
          ) : (
            <div className="vehicle-grid">
              {vehicles.map((vehicle) => (
                <article className="vehicle-card" key={vehicle.id}>
                  <div className="vehicle-plate">{formatPlate(vehicle.plate)}</div>
                  <h3>{vehicle.brand} {vehicle.model}</h3>
                  <p>
                    {vehicle.year ?? "Año s/i"} · {vehicle.mileage.toLocaleString("es-CL")} km
                  </p>
                  <div className="vehicle-actions">
                    <button type="button" onClick={() => openEdit(vehicle)}>Editar</button>
                    <button
                      type="button"
                      className={confirmDelete === vehicle.id ? "danger confirm" : "danger"}
                      onClick={() => remove(vehicle.id)}
                      onBlur={() => setConfirmDelete(null)}
                    >
                      {confirmDelete === vehicle.id ? "Confirmar baja" : "Dar de baja"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
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
