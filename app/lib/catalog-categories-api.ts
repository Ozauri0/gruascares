// Categorías del catálogo (ADR 025): lectura pública ordenada (base de la lista de /catalogo, #184) y gestión del administrador.

import { api, apiDelete, apiGet, apiPatch, apiPost } from "./api";

export type CatalogCategory = { id: string; name: string; sortOrder: number };
export type AdminCatalogCategory = CatalogCategory & { productCount: number };

/** GET /api/catalog/categories: categorías en el orden de la tienda (no requiere sesión). */
export async function listPublicCategories(signal?: AbortSignal): Promise<CatalogCategory[]> {
  const { categories } = await apiGet<{ categories: CatalogCategory[] }>("/api/catalog/categories", undefined, { signal, redirectOnUnauthorized: false });
  return categories;
}

/** Con la cantidad de productos de cada una (admin y vendedor). */
export async function listAdminCategories(signal?: AbortSignal): Promise<AdminCatalogCategory[]> {
  const { categories } = await apiGet<{ categories: AdminCatalogCategory[] }>("/api/admin/catalog-categories", undefined, { signal });
  return categories;
}

export async function createCategory(name: string): Promise<void> {
  await apiPost("/api/admin/catalog-categories", { name });
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await apiPatch(`/api/admin/catalog-categories/${encodeURIComponent(id)}`, { name });
}

/** `ids` = todas las categorías en el nuevo orden. */
export async function reorderCategories(ids: string[]): Promise<void> {
  await api("/api/admin/catalog-categories/order", { method: "PUT", body: { ids } });
}

/** Con productos hay que indicar a qué categoría pasan (`reassignTo`); si no, el servidor responde 409. */
export async function deleteCategory(id: string, reassignTo?: string): Promise<void> {
  const suffix = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : "";
  await apiDelete(`/api/admin/catalog-categories/${encodeURIComponent(id)}${suffix}`);
}
