import { Request, Response } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { services } from "../db/schema.js";
import { logAudit } from "../services/audit/audit.service.js";
import { isUuid } from "../utils/validate.js";

const CATEGORIES = ["serviteca", "grua"] as const;
const MAX_PRICE = 100_000_000; // CLP
const MAX_DURATION = 1440; // minutos (un día)

type Values = Partial<typeof services.$inferInsert>;
type Parsed = { ok: true; values: Values } | { ok: false; message: string };

/** Valida el cuerpo de alta (completo) o edición (parcial). */
function parseService(body: Record<string, unknown>, mode: "create" | "update"): Parsed {
  const values: Values = {};
  const has = (key: string) => body[key] !== undefined;

  if (mode === "create" || has("category")) {
    if (!(CATEGORIES as readonly string[]).includes(body.category as string)) {
      return { ok: false, message: `category debe ser uno de [${CATEGORIES.join(", ")}]` };
    }
    values.category = body.category as (typeof CATEGORIES)[number];
  }
  if (mode === "create" || has("name")) {
    if (typeof body.name !== "string" || body.name.trim().length < 3 || body.name.trim().length > 255) {
      return { ok: false, message: "El nombre es obligatorio (3 a 255 caracteres)" };
    }
    values.name = body.name.trim();
  }
  if (has("description")) {
    if (body.description !== null && (typeof body.description !== "string" || body.description.length > 1000)) {
      return { ok: false, message: "La descripción debe ser texto de hasta 1000 caracteres o null" };
    }
    values.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  }
  if (has("basePrice")) {
    const price = body.basePrice;
    if (typeof price !== "number" || !Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      return { ok: false, message: `El precio base debe ser un entero entre 0 y ${MAX_PRICE}` };
    }
    values.basePrice = price;
  }
  if (has("estimatedDurationMin")) {
    const min = body.estimatedDurationMin;
    if (typeof min !== "number" || !Number.isInteger(min) || min < 5 || min > MAX_DURATION) {
      return { ok: false, message: `La duración estimada debe ser un entero de minutos entre 5 y ${MAX_DURATION}` };
    }
    values.estimatedDurationMin = min;
  }
  if (has("isActive")) {
    if (typeof body.isActive !== "boolean") return { ok: false, message: "isActive debe ser true o false" };
    values.isActive = body.isActive;
  }
  return { ok: true, values };
}

const fields = {
  id: services.id,
  category: services.category,
  name: services.name,
  description: services.description,
  basePrice: services.basePrice,
  estimatedDurationMin: services.estimatedDurationMin,
  isActive: services.isActive,
  appointmentCount: sql<number>`(select count(*)::int from "appointments" where "appointments"."service_id" = "services"."id")`,
};

const fail = (res: Response, status: number, error: string, message: string) => res.status(status).json({ error, message });
const serverError = (res: Response, error: unknown, message: string) => {
  console.error(message, error);
  return fail(res, 500, "Internal Server Error", message);
};

/** GET /api/admin/services — todos, incluidos los inactivos, con cuántas citas tiene cada uno. */
export async function listServices(_req: Request, res: Response) {
  try {
    const list = await db.select(fields).from(services).orderBy(asc(services.category), asc(services.name), asc(services.id));
    return res.json({ services: list });
  } catch (error) {
    return serverError(res, error, "Error al consultar los servicios");
  }
}

/** POST /api/admin/services */
export async function createService(req: Request, res: Response) {
  const parsed = parseService(req.body ?? {}, "create");
  if (!parsed.ok) return fail(res, 400, "Bad Request", parsed.message);
  try {
    const [dup] = await db.select({ id: services.id }).from(services).where(sql`${services.category} = ${parsed.values.category} and lower(${services.name}) = lower(${parsed.values.name})`);
    if (dup) return fail(res, 409, "Conflict", "Ya existe un servicio con ese nombre en la categoría");
    const [created] = await db.insert(services).values(parsed.values as typeof services.$inferInsert).returning({ id: services.id });
    const [service] = await db.select(fields).from(services).where(eq(services.id, created.id));
    logAudit({ action: "SERVICE_CREATED", entityType: "service", entityId: created.id, details: { name: service.name, category: service.category, basePrice: service.basePrice }, req });
    return res.status(201).json({ message: "Servicio creado exitosamente", service });
  } catch (error) {
    return serverError(res, error, "Error al crear el servicio");
  }
}

/** PATCH /api/admin/services/:id — las citas existentes conservan su servicio (se relacionan por id). */
export async function updateService(req: Request, res: Response) {
  const { id } = req.params;
  if (!isUuid(id)) return fail(res, 400, "Bad Request", "ID de servicio inválido: debe ser un UUID");
  const parsed = parseService(req.body ?? {}, "update");
  if (!parsed.ok) return fail(res, 400, "Bad Request", parsed.message);
  if (Object.keys(parsed.values).length === 0) return fail(res, 400, "Bad Request", "Indica al menos un campo a modificar");
  try {
    const [current] = await db.select().from(services).where(eq(services.id, id));
    if (!current) return fail(res, 404, "Not Found", "El servicio solicitado no existe");
    const category = parsed.values.category ?? current.category;
    const name = parsed.values.name ?? current.name;
    if (parsed.values.category !== undefined || parsed.values.name !== undefined) {
      const [dup] = await db.select({ id: services.id }).from(services).where(sql`${services.category} = ${category} and lower(${services.name}) = lower(${name}) and ${services.id} <> ${id}`);
      if (dup) return fail(res, 409, "Conflict", "Ya existe un servicio con ese nombre en la categoría");
    }
    await db.update(services).set(parsed.values).where(eq(services.id, id));
    const [service] = await db.select(fields).from(services).where(eq(services.id, id));
    logAudit({ action: "SERVICE_UPDATED", entityType: "service", entityId: id, details: { fields: Object.keys(parsed.values), isActive: service.isActive }, req });
    return res.json({ message: "Servicio actualizado exitosamente", service });
  } catch (error) {
    return serverError(res, error, "Error al actualizar el servicio");
  }
}

/** DELETE /api/admin/services/:id — solo si nunca se usó en una cita; si no, se desactiva (409). */
export async function deleteService(req: Request, res: Response) {
  const { id } = req.params;
  if (!isUuid(id)) return fail(res, 400, "Bad Request", "ID de servicio inválido: debe ser un UUID");
  try {
    const [current] = await db.select(fields).from(services).where(eq(services.id, id));
    if (!current) return fail(res, 404, "Not Found", "El servicio solicitado no existe");
    if (current.appointmentCount > 0) {
      return fail(res, 409, "Conflict", "El servicio tiene citas registradas y no se puede borrar: desactívalo para ocultarlo");
    }
    await db.delete(services).where(eq(services.id, id));
    logAudit({ action: "SERVICE_DELETED", entityType: "service", entityId: id, details: { name: current.name }, req });
    return res.json({ message: "Servicio eliminado exitosamente", deletedId: id });
  } catch (error) {
    // Una cita creada justo ahora hace fallar la clave foránea (restrict): mismo mensaje.
    if ((error as { code?: string })?.code === "23503") {
      return fail(res, 409, "Conflict", "El servicio tiene citas registradas y no se puede borrar: desactívalo para ocultarlo");
    }
    return serverError(res, error, "Error al eliminar el servicio");
  }
}
