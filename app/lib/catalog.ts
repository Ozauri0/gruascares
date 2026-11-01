// Catálogo de la tienda visual. Los productos viven en el backend (GET /api/catalog público y
// /api/admin/catalog para el administrador); los precios y el stock son referenciales (sin pagos).

export type ProductArt = "tyre" | "oil" | "battery";

export type Product = {
  id: string;
  name: string;
  text: string;
  price: number;
  stock: number;
  category: string;
  tag: string | null;
  art: ProductArt;
  image: string | null;
  featured: boolean;
  active: boolean;
};

export function formatPrice(value: number): string {
  return `$${value.toLocaleString("es-CL")}`;
}
