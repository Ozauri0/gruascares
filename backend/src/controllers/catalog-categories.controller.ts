import { Request, Response } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { productCategories, products } from "../db/schema.js";
import { logAudit } from "../services/audit/audit.service.js";
import { isUuid } from "../utils/validate.js";
import { isUniqueViolation } from "../utils/db-errors.js";

const NAME_MAX = 100;
const categoryOrder = [asc(productCategories.sortOrder), asc(productCategories.name)];

/** Los nombres se guardan en mayúsculas y sin espacios repetidos (igual que las categorías históricas de los productos). */
export function normalizeCategoryName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ").toUpperCase();
  return name.length >= 2 && name.length <= NAME_MAX ? name : null;
}

const NAME_ERROR = `El nombre de la categoría debe tener entre 2 y ${NAME_MAX} caracteres`;

/** Categorías con cuántos productos tiene cada una, en el orden de la tienda. */
async function listWithCounts() {
  return db
    .select({
      id: productCategories.id,
      name: productCategories.name,
      sortOrder: productCategories.sortOrder,
      productCount: sql<number>`(select count(*)::int from "products" where "products"."category" = "product_categories"."name")`,
    })
    .from(productCategories)
    .orderBy(...categoryOrder);
}

const fail = (res: Response, status: number, error: string, message: string) => res.status(status).json({ error, message });
const serverError = (res: Response, error: unknown, message: string) => {
  console.error(message, error);
  return fail(res, 500, "Internal Server Error", message);
};

/** GET /api/catalog/categories — público: categorías ordenadas (base de la lista visible de /catalogo). */
export async function getPublicCategories(_req: Request, res: Response) {
  try {
    const categories = await db
      .select({ id: productCategories.id, name: productCategories.name, sortOrder: productCategories.sortOrder })
      .from(productCategories)
      .orderBy(...categoryOrder);
    res.setHeader("Cache-Control", "public, max-age=30");
    return res.json({ categories });
  } catch (error) {
    return serverError(res, error, "Error al consultar las categorías");
  }
}

/** GET /api/admin/catalog-categories — con la cantidad de productos de cada una (admin y vendedor). */
export async function getAdminCategories(_req: Request, res: Response) {
  try {
    return res.json({ categories: await listWithCounts() });
  } catch (error) {
    return serverError(res, error, "Error al consultar las categorías");
  }
}

/** POST /api/admin/catalog-categories — queda al final del orden. */
export async function createCategory(req: Request, res: Response) {
  const name = normalizeCategoryName(req.body?.name);
  if (!name) return fail(res, 400, "Bad Request", NAME_ERROR);
  try {
    const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${productCategories.sortOrder}), -1) + 1` }).from(productCategories);
    const [created] = await db.insert(productCategories).values({ name, sortOrder: next }).returning();
    logAudit({ action: "CATALOG_CATEGORY_CREATED", entityType: "product_category", entityId: created.id, details: { name }, req });
    return res.status(201).json({ message: "Categoría creada exitosamente", category: { ...created, productCount: 0 } });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(res, 409, "Conflict", "Ya existe una categoría con ese nombre");
    return serverError(res, error, "Error al crear la categoría");
  }
}

/** PATCH /api/admin/catalog-categories/:id — renombra (los productos la siguen) y/o cambia el orden. */
export async function updateCategory(req: Request, res: Response) {
  const { id } = req.params;
  if (!isUuid(id)) return fail(res, 400, "Bad Request", "ID de categoría inválido: debe ser un UUID");
  const body = req.body ?? {};
  const name = body.name === undefined ? undefined : normalizeCategoryName(body.name);
  if (name === null) return fail(res, 400, "Bad Request", NAME_ERROR);
  const order = body.sortOrder;
  if (order !== undefined && (typeof order !== "number" || !Number.isInteger(order) || order < 0 || order > 10_000)) {
    return fail(res, 400, "Bad Request", "El orden debe ser un entero entre 0 y 10000");
  }
  if (name === undefined && order === undefined) return fail(res, 400, "Bad Request", "Indica al menos un campo a modificar");

  try {
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(productCategories).where(eq(productCategories.id, id));
      if (!current) return null;
      const [row] = await tx
        .update(productCategories)
        .set({ ...(name !== undefined ? { name } : {}), ...(order !== undefined ? { sortOrder: order } : {}) })
        .where(eq(productCategories.id, id))
        .returning();
      if (name !== undefined && name !== current.name) {
        await tx.update(products).set({ category: name, updatedAt: new Date() }).where(eq(products.category, current.name));
      }
      return { row, previous: current.name };
    });
    if (!updated) return fail(res, 404, "Not Found", "La categoría solicitada no existe");
    logAudit({ action: "CATALOG_CATEGORY_UPDATED", entityType: "product_category", entityId: id, details: { from: updated.previous, to: updated.row.name, sortOrder: updated.row.sortOrder }, req });
    return res.json({ message: "Categoría actualizada exitosamente", category: updated.row });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(res, 409, "Conflict", "Ya existe una categoría con ese nombre");
    return serverError(res, error, "Error al actualizar la categoría");
  }
}

/** PUT /api/admin/catalog-categories/order — { ids: [...] } con todas las categorías en el nuevo orden. */
export async function reorderCategories(req: Request, res: Response) {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isUuid) || new Set(ids).size !== ids.length) {
    return fail(res, 400, "Bad Request", "ids debe ser la lista de todas las categorías, sin repetir");
  }
  try {
    const ok = await db.transaction(async (tx) => {
      const existing = await tx.select({ id: productCategories.id }).from(productCategories);
      if (existing.length !== ids.length || !existing.every((c) => ids.includes(c.id))) return false;
      for (const [index, id] of (ids as string[]).entries()) {
        await tx.update(productCategories).set({ sortOrder: index }).where(eq(productCategories.id, id));
      }
      return true;
    });
    if (!ok) return fail(res, 400, "Bad Request", "La lista debe incluir exactamente todas las categorías existentes");
    logAudit({ action: "CATALOG_CATEGORY_REORDERED", entityType: "product_category", details: { count: ids.length }, req });
    return res.json({ message: "Orden actualizado exitosamente", categories: await listWithCounts() });
  } catch (error) {
    return serverError(res, error, "Error al ordenar las categorías");
  }
}

/**
 * DELETE /api/admin/catalog-categories/:id — con productos se impide (409) salvo que se indique `?reassignTo=<id de otra categoría>`,
 * en cuyo caso los productos pasan a esa categoría antes de quitar esta.
 */
export async function deleteCategory(req: Request, res: Response) {
  const { id } = req.params;
  if (!isUuid(id)) return fail(res, 400, "Bad Request", "ID de categoría inválido: debe ser un UUID");
  const reassignTo = req.query.reassignTo;
  if (reassignTo !== undefined && (!isUuid(reassignTo) || reassignTo === id)) {
    return fail(res, 400, "Bad Request", "reassignTo debe ser el ID de otra categoría");
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(productCategories).where(eq(productCategories.id, id));
      if (!current) return { status: 404 as const };
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(products).where(eq(products.category, current.name));
      let moved = 0;
      if (count > 0) {
        if (!reassignTo) return { status: 409 as const, count };
        const [target] = await tx.select().from(productCategories).where(eq(productCategories.id, reassignTo as string));
        if (!target) return { status: 422 as const };
        await tx.update(products).set({ category: target.name, updatedAt: new Date() }).where(eq(products.category, current.name));
        moved = count;
      }
      await tx.delete(productCategories).where(eq(productCategories.id, id));
      return { status: 200 as const, name: current.name, moved };
    });
    if (result.status === 404) return fail(res, 404, "Not Found", "La categoría solicitada no existe");
    if (result.status === 422) return fail(res, 422, "Unprocessable Entity", "La categoría de destino no existe");
    if (result.status === 409) {
      return fail(res, 409, "Conflict", `La categoría tiene ${result.count} producto(s): reasígnalos a otra categoría para poder quitarla`);
    }
    logAudit({ action: "CATALOG_CATEGORY_DELETED", entityType: "product_category", entityId: id, details: { name: result.name, reassigned: result.moved }, req });
    return res.json({ message: "Categoría eliminada exitosamente", deletedId: id, reassigned: result.moved });
  } catch (error) {
    return serverError(res, error, "Error al eliminar la categoría");
  }
}
