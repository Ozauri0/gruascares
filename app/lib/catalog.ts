// Catálogo de la tienda visual.
// Etapa mock: los productos viven aquí y el admin los edita en
// /admin/catalogo persistiendo en `localStorage`. Al existir backend,
// GET /api/catalog y PATCH /api/catalog/:id reemplazan load/save.

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

const CATALOG_KEY = "gruas-cares-catalog";

export const DEFAULT_PRODUCTS: Product[] = [
  { id: "p-tyre", name: "Neumáticos para camión", text: "Opciones para trabajo pesado y recorridos exigentes.", price: 189990, stock: 8, category: "TOP VENTAS", tag: "TOP VENTA 01", art: "tyre", image: null, featured: true, active: true },
  { id: "p-oil", name: "Aceite de motor", text: "Lubricación para mantener tu vehículo en movimiento.", price: 32990, stock: 24, category: "TOP VENTAS", tag: "TOP VENTA 02", art: "oil", image: null, featured: true, active: true },
  { id: "p-battery", name: "Baterías", text: "Energía confiable para autos, camiones y maquinaria.", price: 89990, stock: 6, category: "TOP VENTAS", tag: "TOP VENTA 03", art: "battery", image: null, featured: true, active: true },
  { id: "p-filtros", name: "Filtros de aceite y aire", text: "Insumos para el mantenimiento periódico de tu vehículo.", price: 12990, stock: 18, category: "MANTENCIÓN", tag: null, art: "oil", image: null, featured: false, active: true },
  { id: "p-pastillas", name: "Pastillas de freno", text: "Componentes para una conducción más segura.", price: 46990, stock: 12, category: "SEGURIDAD", tag: null, art: "tyre", image: null, featured: false, active: true },
  { id: "p-refrigerante", name: "Refrigerante", text: "Protección para el sistema de enfriamiento.", price: 9990, stock: 15, category: "MANTENCIÓN", tag: null, art: "battery", image: null, featured: false, active: true },
  { id: "p-kit", name: "Kit de emergencia", text: "Elementos esenciales para llevar siempre contigo.", price: 24990, stock: 9, category: "SEGURIDAD", tag: null, art: "oil", image: null, featured: false, active: true },
  { id: "p-carga", name: "Accesorios para carga", text: "Implementos para organizar y asegurar tu carga.", price: 39990, stock: 7, category: "TRANSPORTE", tag: null, art: "tyre", image: null, featured: false, active: true },
  { id: "p-led", name: "Luces de trabajo LED", text: "Iluminación auxiliar para trabajo y carretera.", price: 54990, stock: 11, category: "EQUIPAMIENTO", tag: null, art: "battery", image: null, featured: false, active: true },
  { id: "p-plumillas", name: "Plumillas limpiaparabrisas", text: "Repuestos para una mejor visibilidad en ruta.", price: 8990, stock: 20, category: "MANTENCIÓN", tag: null, art: "oil", image: null, featured: false, active: true },
  { id: "p-cables", name: "Cables de batería", text: "Apoyo de arranque para llevar siempre en tu vehículo.", price: 17990, stock: 5, category: "EMERGENCIA", tag: null, art: "tyre", image: null, featured: false, active: true },
];

export function formatPrice(value: number): string {
  return `$${value.toLocaleString("es-CL")}`;
}

export function loadCatalog(): Product[] {
  try {
    const saved = window.localStorage.getItem(CATALOG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Product[];
      return parsed.map((item) => ({ ...item, image: item.image ?? null }));
    }
  } catch {
    // Sin respaldo local: catálogo por defecto.
  }
  return DEFAULT_PRODUCTS;
}

export function saveCatalog(products: Product[]) {
  try {
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(products));
  } catch {
    // Almacenamiento no disponible: los cambios solo viven en memoria.
  }
}
