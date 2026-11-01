"use client";

import { EMPTY_FILTERS, hasActiveFilters, type CatalogFilters, type StockFilter, type VisibilityFilter } from "../lib/catalog-filter";

type Props = {
  filters: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
  categories: string[];
  /** Filtros de gestión (stock y visibilidad), solo en el panel de ventas. */
  manage?: boolean;
};

const STOCK_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: "todos", label: "Todo el stock" },
  { value: "con-stock", label: "Con stock" },
  { value: "bajo", label: "Poco stock" },
  { value: "sin-stock", label: "Sin stock" },
];

const VISIBILITY_OPTIONS: { value: VisibilityFilter; label: string }[] = [
  { value: "todos", label: "Visibles y ocultos" },
  { value: "visibles", label: "Visibles en tienda" },
  { value: "ocultos", label: "Ocultos" },
];

/** Buscador y filtros del catálogo; lo usan la tienda pública y el panel de ventas. */
export default function CatalogFilterBar({ filters, onChange, categories, manage = false }: Props) {
  const set = (patch: Partial<CatalogFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="catalog-filters" role="search">
      <label className="catalog-search">
        <span className="sr-only">Buscar productos</span>
        <input type="search" placeholder="Buscar por nombre, descripción o categoría" value={filters.query} onChange={(e) => set({ query: e.target.value })} />
      </label>
      <label>
        <span className="sr-only">Categoría</span>
        <select value={filters.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {manage && (
        <>
          <label>
            <span className="sr-only">Stock</span>
            <select value={filters.stock ?? "todos"} onChange={(e) => set({ stock: e.target.value as StockFilter })}>
              {STOCK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Visibilidad</span>
            <select value={filters.visibility ?? "todos"} onChange={(e) => set({ visibility: e.target.value as VisibilityFilter })}>
              {VISIBILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </>
      )}
      {hasActiveFilters(filters) && <button type="button" className="catalog-filters-clear" onClick={() => onChange(EMPTY_FILTERS)}>Limpiar filtros</button>}
    </div>
  );
}
