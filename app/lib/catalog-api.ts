// Catálogo de productos contra el backend. Lectura pública y gestión del administrador.

import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { toProduct } from "./api-adapters";
import type { ApiProduct } from "./api-types";
import type { Product, ProductArt } from "./catalog";

/** GET /api/catalog: productos activos, destacados primero (no requiere sesión). */
export async function listPublicCatalog(signal?: AbortSignal): Promise<Product[]> {
  const { products } = await apiGet<{ products: ApiProduct[] }>("/api/catalog", undefined, { signal, redirectOnUnauthorized: false });
  return products.map(toProduct);
}

export async function listAdminCatalog(signal?: AbortSignal): Promise<Product[]> {
  const { products } = await apiGet<{ products: ApiProduct[] }>("/api/admin/catalog", undefined, { signal });
  return products.map(toProduct);
}

export type NewProduct = { name: string; description: string; category: string; price: number; stock: number; art: ProductArt; featured: boolean; image?: string };

export async function createProduct(input: NewProduct): Promise<Product> {
  const { product } = await apiPost<{ product: ApiProduct }>("/api/admin/catalog", input);
  return toProduct(product);
}

export type ProductPatch = Partial<{ price: number; stock: number; active: boolean; featured: boolean; image: string | null; name: string; description: string }>;

export async function updateProduct(id: string, patch: ProductPatch): Promise<Product> {
  const { product } = await apiPatch<{ product: ApiProduct }>(`/api/admin/catalog/${encodeURIComponent(id)}`, patch);
  return toProduct(product);
}

export async function deleteProduct(id: string): Promise<void> {
  await apiDelete(`/api/admin/catalog/${encodeURIComponent(id)}`);
}
