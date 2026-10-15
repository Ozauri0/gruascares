import { Request, Response } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { products } from "../db/schema.js";
import { logAudit } from "../services/audit/audit.service.js";
import { isUuid } from "../utils/validate.js";

const ARTS = ["tyre", "oil", "battery"] as const;
type Art = (typeof ARTS)[number];

const MAX_PRICE = 100_000_000; // CLP
const MAX_STOCK = 1_000_000;

const publicFields = {
  id: products.id,
  name: products.name,
  description: products.description,
  price: products.price,
  stock: products.stock,
  category: products.category,
  tag: products.tag,
  art: products.art,
  image: products.image,
  featured: products.featured,
};

const orderBy = [desc(products.featured), asc(products.sortOrder), asc(products.name), asc(products.id)];

/**
 * Imagen permitida: nada (arte automático), una ruta local /images/... o una URL https.
 * No se aceptan data: URLs ni otros esquemas (javascript:, http:, etc.): evita inflar la base y vectores de abuso.
 */
export function isAllowedImage(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return false;
  if (value.startsWith("/images/")) return !value.includes("..") && !/[\s"'<>\\]/.test(value);
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !/[\s"'<>\\]/.test(value);
  } catch {
    return false;
  }
}

type Parsed = { ok: true; values: Partial<typeof products.$inferInsert> } | { ok: false; message: string };

/** Valida y normaliza el cuerpo de alta (completo) o edición (parcial). */
function parseProduct(body: Record<string, unknown>, mode: "create" | "update"): Parsed {
  const values: Partial<typeof products.$inferInsert> = {};
  const has = (key: string) => body[key] !== undefined;

  if (mode === "create" || has("name")) {
    if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 255) {
      return { ok: false, message: "El nombre es obligatorio (2 a 255 caracteres)" };
    }
    values.name = body.name.trim();
  }
  if (has("description")) {
    if (typeof body.description !== "string" || body.description.length > 1000) {
      return { ok: false, message: "La descripción debe ser texto de hasta 1000 caracteres" };
    }
    values.description = body.description.trim();
  }
  if (mode === "create" || has("price")) {
    const price = body.price;
    if (typeof price !== "number" || !Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      return { ok: false, message: `El precio debe ser un entero entre 0 y ${MAX_PRICE}` };
    }
    values.price = price;
  }
  if (mode === "create" || has("stock")) {
    const stock = body.stock;
    if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
      return { ok: false, message: `El stock debe ser un entero entre 0 y ${MAX_STOCK}` };
    }
    values.stock = stock;
  }
  if (has("category")) {
    if (typeof body.category !== "string" || body.category.trim().length === 0 || body.category.length > 100) {
      return { ok: false, message: "La categoría debe ser texto de hasta 100 caracteres" };
    }
    values.category = body.category.trim().toUpperCase();
  }
  if (has("tag")) {
    if (body.tag !== null && (typeof body.tag !== "string" || body.tag.length > 100)) {
      return { ok: false, message: "La etiqueta debe ser texto de hasta 100 caracteres o null" };
    }
    values.tag = typeof body.tag === "string" && body.tag.trim() ? body.tag.trim() : null;
  }
  if (mode === "create" || has("art")) {
    if (!(ARTS as readonly string[]).includes(body.art as string)) {
      return { ok: false, message: `art debe ser uno de [${ARTS.join(", ")}]` };
    }
    values.art = body.art as Art;
  }
  if (has("image")) {
    if (body.image !== null && !isAllowedImage(body.image)) {
      return { ok: false, message: "La imagen debe ser null, una ruta /images/... o una URL https (máx. 500 caracteres)" };
    }
    values.image = (body.image as string | null) ?? null;
  }
  for (const key of ["featured", "active"] as const) {
    if (has(key)) {
      if (typeof body[key] !== "boolean") return { ok: false, message: `${key} debe ser true o false` };
      values[key] = body[key] as boolean;
    }
  }
  return { ok: true, values };
}

/** GET /api/catalog — público: productos activos (destacados primero). */
export async function getPublicCatalog(_req: Request, res: Response) {
  try {
    const list = await db.select(publicFields).from(products).where(eq(products.active, true)).orderBy(...orderBy);
    res.setHeader("Cache-Control", "public, max-age=30");
    return res.json({ products: list });
  } catch (error) {
    console.error("Error al consultar el catálogo:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al consultar el catálogo" });
  }
}

/** GET /api/admin/catalog — todos los productos, incluidos los inactivos. */
export async function getAdminCatalog(_req: Request, res: Response) {
  try {
    const list = await db.select({ ...publicFields, active: products.active }).from(products).orderBy(...orderBy);
    return res.json({ products: list });
  } catch (error) {
    console.error("Error al consultar el catálogo (admin):", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al consultar el catálogo" });
  }
}

/** POST /api/admin/catalog */
export async function createProduct(req: Request, res: Response) {
  try {
    const parsed = parseProduct(req.body ?? {}, "create");
    if (!parsed.ok) return res.status(400).json({ error: "Bad Request", message: parsed.message });

    const [created] = await db
      .insert(products)
      .values(parsed.values as typeof products.$inferInsert)
      .returning({ ...publicFields, active: products.active });

    logAudit({ action: "CATALOG_CREATED", entityType: "product", entityId: created.id, details: { name: created.name, price: created.price }, req });
    return res.status(201).json({ message: "Producto creado exitosamente", product: created });
  } catch (error) {
    console.error("Error al crear producto:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al crear el producto" });
  }
}

/** PATCH /api/admin/catalog/:id */
export async function updateProduct(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: "Bad Request", message: "ID de producto inválido: debe ser un UUID" });

    const parsed = parseProduct(req.body ?? {}, "update");
    if (!parsed.ok) return res.status(400).json({ error: "Bad Request", message: parsed.message });
    if (Object.keys(parsed.values).length === 0) {
      return res.status(400).json({ error: "Bad Request", message: "Indica al menos un campo a modificar" });
    }

    const [updated] = await db
      .update(products)
      .set({ ...parsed.values, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning({ ...publicFields, active: products.active });
    if (!updated) return res.status(404).json({ error: "Not Found", message: "El producto solicitado no existe" });

    logAudit({ action: "CATALOG_UPDATED", entityType: "product", entityId: id, details: { fields: Object.keys(parsed.values) }, req });
    return res.json({ message: "Producto actualizado exitosamente", product: updated });
  } catch (error) {
    console.error("Error al actualizar producto:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al actualizar el producto" });
  }
}

/** DELETE /api/admin/catalog/:id */
export async function deleteProduct(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: "Bad Request", message: "ID de producto inválido: debe ser un UUID" });

    const [deleted] = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id, name: products.name });
    if (!deleted) return res.status(404).json({ error: "Not Found", message: "El producto solicitado no existe" });

    logAudit({ action: "CATALOG_DELETED", entityType: "product", entityId: id, details: { name: deleted.name }, req });
    return res.json({ message: "Producto eliminado exitosamente", deletedId: id });
  } catch (error) {
    console.error("Error al eliminar producto:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al eliminar el producto" });
  }
}
