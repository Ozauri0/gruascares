"use client";

import { createCategory, deleteCategory, listAdminCategories, renameCategory, reorderCategories } from "../lib/catalog-categories-api";
import ListManager, { type ListManagerConfig } from "./ListManager";

const CONFIG: ListManagerConfig = {
  title: "Categorías del catálogo",
  itemLabel: { one: "la categoría", the: "la categoría", other: "otra categoría" },
  countLabel: ["producto", "productos"],
  newPlaceholder: "Nueva categoría",
  maxLength: 100,
  locked: "GENERAL",
  load: async () => (await listAdminCategories()).map((c) => ({ id: c.id, name: c.name, count: c.productCount })),
  create: createCategory,
  rename: renameCategory,
  reorder: reorderCategories,
  remove: deleteCategory,
};

/** Ventana para crear, renombrar, ordenar y quitar las categorías del catálogo (admin y vendedor). */
export default function CategoriesManager({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  return <ListManager config={CONFIG} onClose={onClose} onChanged={onChanged} />;
}
