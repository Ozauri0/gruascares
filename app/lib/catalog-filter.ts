// Búsqueda y filtros del catálogo (tienda pública y panel de ventas): una sola lógica para las dos vistas.

import type { Product } from "./catalog";

/** Productos con este stock o menos (y más de 0) se consideran por reponer; igual que el inicio de ventas. */
export const LOW_STOCK = 5;

export type StockFilter = "todos" | "con-stock" | "bajo" | "sin-stock";
export type VisibilityFilter = "todos" | "visibles" | "ocultos";

export type CatalogFilters = {
  query: string;
  /** "" = todas las categorías */
  category: string;
  stock?: StockFilter;
  visibility?: VisibilityFilter;
};

export const EMPTY_FILTERS: CatalogFilters = { query: "", category: "", stock: "todos", visibility: "todos" };

/** Minúsculas y sin tildes, para que «bateria» encuentre «Batería». */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Categorías distintas, ordenadas alfabéticamente. */
export function categoriesOf(products: Product[]): string[] {
  return [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

/** Cada palabra de la búsqueda debe aparecer en el nombre, la descripción, la categoría o la etiqueta. */
export function filterProducts(products: Product[], filters: CatalogFilters): Product[] {
  const words = normalize(filters.query).split(/\s+/).filter(Boolean);
  const { category, stock = "todos", visibility = "todos" } = filters;
  return products.filter((p) => {
    if (category && p.category !== category) return false;
    if (visibility === "visibles" && !p.active) return false;
    if (visibility === "ocultos" && p.active) return false;
    if (stock === "con-stock" && p.stock <= 0) return false;
    if (stock === "sin-stock" && p.stock > 0) return false;
    if (stock === "bajo" && !(p.stock > 0 && p.stock <= LOW_STOCK)) return false;
    if (words.length === 0) return true;
    const haystack = normalize(`${p.name} ${p.text} ${p.category} ${p.tag ?? ""}`);
    return words.every((word) => haystack.includes(word));
  });
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return Boolean(filters.query.trim() || filters.category || (filters.stock && filters.stock !== "todos") || (filters.visibility && filters.visibility !== "todos"));
}
