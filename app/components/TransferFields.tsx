"use client";

import { CARGO_OPTIONS, type CargoType, type TransferDraft } from "../lib/cargo";
import Icon from "./Icon";

/** Datos propios de una solicitud de grúa: qué se traslada, de dónde a dónde y los datos de la carga (#141). */
export default function TransferFields({ value, onChange }: { value: TransferDraft; onChange: (next: TransferDraft) => void }) {
  const set = (patch: Partial<TransferDraft>) => onChange({ ...value, ...patch });
  return (
    <>
      <label>
        <span><Icon name="truck" />¿Qué se va a trasladar? *</span>
        <select value={value.cargoType} onChange={(event) => set({ cargoType: event.target.value as CargoType | "" })}>
          <option value="">Selecciona…</option>
          {CARGO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          Lugar de retiro *
          <input placeholder="Ej: Calle Prat 450, Villarrica (o punto de referencia en ruta)" value={value.location} onChange={(e) => set({ location: e.target.value })} />
        </label>
        <label>
          Destino *
          <input placeholder="Ej: Bodega en Pucón, taller, puerto seco…" value={value.destination} onChange={(e) => set({ destination: e.target.value })} />
        </label>
      </div>
      <label>
        Datos de la carga *
        <textarea rows={2} placeholder="Ej: Contenedor de 40 pies, unas 12 toneladas / Auto sin batería, no rueda…" value={value.cargoDetails} onChange={(e) => set({ cargoDetails: e.target.value })} />
      </label>
    </>
  );
}
