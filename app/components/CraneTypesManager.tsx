"use client";

import { createCraneType, deleteCraneType, listCraneTypes, renameCraneType, reorderCraneTypes } from "../lib/cranes-api";
import ListManager, { type ListManagerConfig } from "./ListManager";

const CONFIG: ListManagerConfig = {
  title: "Tipos de grúa",
  itemLabel: { one: "el tipo", the: "el tipo", other: "otro tipo" },
  countLabel: ["grúa", "grúas"],
  newPlaceholder: "Nuevo tipo (ej. Cama baja)",
  maxLength: 60,
  locked: "Otro",
  load: async () => (await listCraneTypes()).map((t) => ({ id: t.id, name: t.name, count: t.craneCount })),
  create: createCraneType,
  rename: renameCraneType,
  reorder: reorderCraneTypes,
  remove: deleteCraneType,
};

/** Ventana para crear, renombrar, ordenar y quitar los tipos de grúa (jefe de grúas y admin). */
export default function CraneTypesManager({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  return <ListManager config={CONFIG} onClose={onClose} onChanged={onChanged} />;
}
