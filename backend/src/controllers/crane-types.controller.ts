// Tipos de grúa de la flota (tabla crane_types, ADR 023): igual que las categorías del catálogo (ADR 025),
// se crean, renombran, ordenan y quitan; quitar uno con grúas exige elegir a qué tipo pasan.
import { Request, Response } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { craneTypes, cranes } from "../db/schema.js";
import { logAudit } from "../services/audit/audit.service.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { isUuid } from "../utils/validate.js";
import { DEFAULT_CRANE_TYPE } from "./cranes.controller.js";

const NAME_MAX = 60;
const NAME_ERROR = `El nombre del tipo debe tener entre 2 y ${NAME_MAX} caracteres`;
const typeOrder = [asc(craneTypes.sortOrder), asc(craneTypes.name)];

/** Se guarda como se escribió, sin espacios repetidos; la unicidad no distingue mayúsculas. */
export function normalizeCraneTypeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= NAME_MAX ? name : null;
}

/** «Otro» es el tipo de respaldo de las grúas sin tipo: no se renombra ni se quita. */
const isFallback = (name: string) => name.toLowerCase() === DEFAULT_CRANE_TYPE.toLowerCase();

const fail = (res: Response, status: number, error: string, message: string) => res.status(status).json({ error, message });
const serverError = (res: Response, error: unknown, message: string) => {
  console.error(message, error);
  return fail(res, 500, "Internal Server Error", message);
};

/** Tipos en su orden, con cuántas grúas (activas o de baja) usa cada uno. */
function listWithCounts() {
  return db
    .select({
      id: craneTypes.id,
      name: craneTypes.name,
      sortOrder: craneTypes.sortOrder,
      craneCount: sql<number>`(select count(*)::int from "cranes" where "cranes"."type" = "crane_types"."name")`,
    })
    .from(craneTypes)
    .orderBy(...typeOrder);
}

/** GET /api/cranes/types */
export async function listCraneTypes(_req: Request, res: Response) {
  try {
    return res.json({ types: await listWithCounts() });
  } catch (error) {
    return serverError(res, error, "Error al consultar los tipos de grúa");
  }
}

/** POST /api/cranes/types { name } — queda al final del orden. */
export async function createCraneType(req: Request, res: Response) {
  const name = normalizeCraneTypeName(req.body?.name);
  if (!name) return fail(res, 400, "Bad Request", NAME_ERROR);
  try {
    const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${craneTypes.sortOrder}), -1) + 1` }).from(craneTypes);
    const [created] = await db.insert(craneTypes).values({ name, sortOrder: next }).returning({ id: craneTypes.id, name: craneTypes.name, sortOrder: craneTypes.sortOrder });
    logAudit({ action: "CRANE_TYPE_CREATED", entityType: "crane_type", entityId: created.id, details: { name }, req });
    return res.status(201).json({ message: "Tipo de grúa agregado", type: { ...created, craneCount: 0 } });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(res, 409, "Conflict", "Ya existe un tipo de grúa con ese nombre");
    return serverError(res, error, "Error al agregar el tipo de grúa");
  }
}

/** PATCH /api/cranes/types/:id { name } — renombra; las grúas de ese tipo lo siguen. */
export async function renameCraneType(req: Request, res: Response) {
  const { id } = req.params;
  if (!isUuid(id)) return fail(res, 400, "Bad Request", "ID de tipo inválido: debe ser un UUID");
  const name = normalizeCraneTypeName(req.body?.name);
  if (!name) return fail(res, 400, "Bad Request", NAME_ERROR);
  try {
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(craneTypes).where(eq(craneTypes.id, id));
      if (!current) return { status: 404 as const };
      if (isFallback(current.name) && name !== current.name) return { status: "fallback" as const };
      const [row] = await tx.update(craneTypes).set({ name }).where(eq(craneTypes.id, id)).returning();
      if (name !== current.name) await tx.update(cranes).set({ type: name, updatedAt: new Date() }).where(eq(cranes.type, current.name));
      return { status: 200 as const, row, previous: current.name };
    });
    if (result.status === 404) return fail(res, 404, "Not Found", "El tipo de grúa no existe");
    if (result.status === "fallback") return fail(res, 409, "Conflict", `«${DEFAULT_CRANE_TYPE}» es el tipo de respaldo y no se puede renombrar`);
    logAudit({ action: "CRANE_TYPE_UPDATED", entityType: "crane_type", entityId: id, details: { from: result.previous, to: result.row.name }, req });
    return res.json({ message: "Tipo de grúa actualizado", type: result.row });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(res, 409, "Conflict", "Ya existe un tipo de grúa con ese nombre");
    return serverError(res, error, "Error al renombrar el tipo de grúa");
  }
}

/** PUT /api/cranes/types/order { ids } — todos los tipos en el nuevo orden. */
export async function reorderCraneTypes(req: Request, res: Response) {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isUuid) || new Set(ids).size !== ids.length) {
    return fail(res, 400, "Bad Request", "ids debe ser la lista de todos los tipos, sin repetir");
  }
  try {
    const ok = await db.transaction(async (tx) => {
      const existing = await tx.select({ id: craneTypes.id }).from(craneTypes);
      if (existing.length !== ids.length || !existing.every((t) => ids.includes(t.id))) return false;
      for (const [index, typeId] of (ids as string[]).entries()) {
        await tx.update(craneTypes).set({ sortOrder: index }).where(eq(craneTypes.id, typeId));
      }
      return true;
    });
    if (!ok) return fail(res, 400, "Bad Request", "La lista debe incluir exactamente todos los tipos existentes");
    logAudit({ action: "CRANE_TYPE_REORDERED", entityType: "crane_type", details: { count: ids.length }, req });
    return res.json({ message: "Orden actualizado", types: await listWithCounts() });
  } catch (error) {
    return serverError(res, error, "Error al ordenar los tipos de grúa");
  }
}

/**
 * DELETE /api/cranes/types/:id[?reassignTo=<id de otro tipo>] — si hay grúas de ese tipo se impide (409)
 * salvo que se indique a qué tipo pasan.
 */
export async function deleteCraneType(req: Request, res: Response) {
  const { id } = req.params;
  if (!isUuid(id)) return fail(res, 400, "Bad Request", "ID de tipo inválido: debe ser un UUID");
  const reassignTo = req.query.reassignTo;
  if (reassignTo !== undefined && (!isUuid(reassignTo) || reassignTo === id)) {
    return fail(res, 400, "Bad Request", "reassignTo debe ser el ID de otro tipo de grúa");
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(craneTypes).where(eq(craneTypes.id, id));
      if (!current) return { status: 404 as const };
      if (isFallback(current.name)) return { status: "fallback" as const };
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(cranes).where(eq(cranes.type, current.name));
      if (count > 0) {
        if (!reassignTo) return { status: 409 as const, count };
        const [target] = await tx.select().from(craneTypes).where(eq(craneTypes.id, reassignTo as string));
        if (!target) return { status: 422 as const };
        await tx.update(cranes).set({ type: target.name, updatedAt: new Date() }).where(eq(cranes.type, current.name));
      }
      await tx.delete(craneTypes).where(eq(craneTypes.id, id));
      return { status: 200 as const, name: current.name, moved: count };
    });
    if (result.status === 404) return fail(res, 404, "Not Found", "El tipo de grúa no existe");
    if (result.status === "fallback") return fail(res, 409, "Conflict", `«${DEFAULT_CRANE_TYPE}» es el tipo de respaldo y no se puede quitar`);
    if (result.status === 422) return fail(res, 422, "Unprocessable Entity", "El tipo de destino no existe");
    if (result.status === 409) return fail(res, 409, "Conflict", `El tipo tiene ${result.count} grúa(s): elige a qué tipo pasan para poder quitarlo`);
    logAudit({ action: "CRANE_TYPE_DELETED", entityType: "crane_type", entityId: id, details: { name: result.name, reassigned: result.moved }, req });
    return res.json({ message: "Tipo de grúa eliminado", deletedId: id, reassigned: result.moved });
  } catch (error) {
    return serverError(res, error, "Error al quitar el tipo de grúa");
  }
}
