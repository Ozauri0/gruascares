import { Request, Response } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { workers } from "../db/schema.js";
import { logAudit } from "../services/audit/audit.service.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { isValidRut, normalizeRut } from "../utils/rut.js";
import { MAX_LEN, findTooLong, isUuid } from "../utils/validate.js";
import { WORKER_TYPE_FOR, isWorkerType, managedWorkerTypes, type WorkerType } from "../utils/workers.js";

const publicWorker = {
  id: workers.id,
  name: workers.name,
  rut: workers.rut,
  phone: workers.phone,
  types: workers.types,
  isActive: workers.isActive,
  createdAt: workers.createdAt,
};

/** Lista de tipos válida (sin repetir y no vacía) o el motivo del rechazo. */
function parseTypes(value: unknown): { types: WorkerType[] } | { error: string } {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isWorkerType)) {
    return { error: "Indica al menos un tipo de trabajador: mecanico o gruero" };
  }
  return { types: [...new Set(value)] };
}

/**
 * GET /api/workers?area=serviteca|grua&active=true|false
 * Trabajadores del área. Cada jefe ve solo los de su área; el admin ve todos (o filtra con ?area=).
 */
export async function listWorkers(req: Request, res: Response) {
  try {
    const mine = managedWorkerTypes(req.user);
    const { area, active } = req.query;
    if (area !== undefined && area !== "serviteca" && area !== "grua") {
      return res.status(400).json({ error: "Bad Request", message: "area debe ser 'serviteca' o 'grua'" });
    }
    const conditions = [];
    if (area) {
      const wanted = WORKER_TYPE_FOR[area];
      if (!mine.includes(wanted)) {
        return res.status(403).json({ error: "Forbidden", message: "No tienes permiso para ver los trabajadores de esta área" });
      }
      conditions.push(sql`${workers.types} && ARRAY[${wanted}]::worker_type[]`);
    } else {
      conditions.push(sql`${workers.types} && ARRAY[${sql.join(mine.map((t) => sql`${t}`), sql`, `)}]::worker_type[]`);
    }
    if (active === "true" || active === "false") conditions.push(eq(workers.isActive, active === "true"));

    const list = await db.select(publicWorker).from(workers).where(and(...conditions)).orderBy(asc(workers.name));
    return res.json({ workers: list });
  } catch (error) {
    console.error("Error al listar trabajadores:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al consultar los trabajadores" });
  }
}

/**
 * POST /api/workers { name, rut, phone?, types }
 * Registra un trabajador sin cuenta. El jefe solo puede crearlos de los tipos de su área.
 */
export async function createWorker(req: Request, res: Response) {
  try {
    const { name, rut, phone, types } = req.body ?? {};
    if (typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ error: "Bad Request", message: "El nombre es obligatorio (mínimo 2 caracteres)" });
    }
    if (typeof rut !== "string" || !isValidRut(rut)) {
      return res.status(400).json({ error: "Bad Request", message: "Debe ingresar un RUT chileno válido" });
    }
    if (phone !== undefined && phone !== null && typeof phone !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "El teléfono debe ser texto" });
    }
    const parsed = parseTypes(types);
    if ("error" in parsed) return res.status(400).json({ error: "Bad Request", message: parsed.error });
    const mine = managedWorkerTypes(req.user);
    if (!parsed.types.every((t) => mine.includes(t))) {
      return res.status(403).json({ error: "Forbidden", message: "Solo puedes registrar trabajadores de tu área" });
    }
    const tooLong = findTooLong([
      ["El nombre", name, MAX_LEN.name],
      ["El teléfono", phone, MAX_LEN.phone],
    ]);
    if (tooLong) return res.status(400).json({ error: "Bad Request", message: tooLong });

    const [created] = await db
      .insert(workers)
      .values({
        name: name.trim(),
        rut: normalizeRut(rut),
        phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
        types: parsed.types,
        createdBy: req.user!.userId,
      })
      .returning(publicWorker);

    logAudit({ action: "WORKER_CREATED", entityType: "worker", entityId: created.id, details: { name: created.name, rut: created.rut, types: created.types }, req });
    return res.status(201).json({ message: "Trabajador registrado", worker: created });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Conflict", message: "Ya existe un trabajador con ese RUT" });
    }
    console.error("Error al crear trabajador:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al registrar el trabajador" });
  }
}

/**
 * PATCH /api/workers/:id { name?, rut?, phone?, types?, isActive? }
 * El jefe edita a los trabajadores de su área. Los tipos de otra área se conservan: solo cambia los suyos.
 * Desactivar no borra nada: el historial de servicios sigue mostrando su nombre.
 */
export async function updateWorker(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ error: "Bad Request", message: "ID de trabajador inválido: debe ser un UUID" });
    }
    const { name, rut, phone, types, isActive } = req.body ?? {};
    if (name === undefined && rut === undefined && phone === undefined && types === undefined && isActive === undefined) {
      return res.status(400).json({ error: "Bad Request", message: "Indica al menos un campo a modificar (name, rut, phone, types, isActive)" });
    }
    if (name !== undefined && (typeof name !== "string" || name.trim().length < 2)) {
      return res.status(400).json({ error: "Bad Request", message: "El nombre debe tener al menos 2 caracteres" });
    }
    if (rut !== undefined && (typeof rut !== "string" || !isValidRut(rut))) {
      return res.status(400).json({ error: "Bad Request", message: "Debe ingresar un RUT chileno válido" });
    }
    if (phone !== undefined && phone !== null && typeof phone !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "El teléfono debe ser texto" });
    }
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return res.status(400).json({ error: "Bad Request", message: "isActive debe ser verdadero o falso" });
    }
    const tooLong = findTooLong([
      ["El nombre", name, MAX_LEN.name],
      ["El teléfono", phone, MAX_LEN.phone],
    ]);
    if (tooLong) return res.status(400).json({ error: "Bad Request", message: tooLong });

    const [existing] = await db.select().from(workers).where(eq(workers.id, id)).limit(1);
    const mine = managedWorkerTypes(req.user);
    if (!existing || !existing.types.some((t) => mine.includes(t))) {
      // Para quien no es de su área el trabajador "no existe": no se revela quién trabaja en la otra.
      return res.status(404).json({ error: "Not Found", message: "El trabajador solicitado no existe" });
    }

    const updates: Partial<typeof workers.$inferInsert> = { updatedAt: new Date() };
    if (typeof name === "string") updates.name = name.trim();
    if (typeof rut === "string") updates.rut = normalizeRut(rut);
    if (phone !== undefined) updates.phone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
    if (typeof isActive === "boolean") updates.isActive = isActive;
    if (types !== undefined) {
      const parsed = parseTypes(types);
      if ("error" in parsed) return res.status(400).json({ error: "Bad Request", message: parsed.error });
      if (!parsed.types.every((t) => mine.includes(t) || existing.types.includes(t))) {
        return res.status(403).json({ error: "Forbidden", message: "Solo puedes asignar tipos de tu área" });
      }
      const kept = existing.types.filter((t) => !mine.includes(t)); // tipos de otra área: no se tocan
      const next = [...new Set([...kept, ...parsed.types.filter((t) => mine.includes(t))])];
      if (next.length === 0) {
        return res.status(400).json({ error: "Bad Request", message: "El trabajador debe tener al menos un tipo" });
      }
      updates.types = next;
    }

    const [updated] = await db.update(workers).set(updates).where(eq(workers.id, id)).returning(publicWorker);
    const action = typeof isActive === "boolean" && isActive !== existing.isActive ? (isActive ? "WORKER_ACTIVATED" : "WORKER_DEACTIVATED") : "WORKER_UPDATED";
    logAudit({ action, entityType: "worker", entityId: id, details: { name: updated.name, fields: Object.keys(updates).filter((k) => k !== "updatedAt") }, req });
    return res.json({ message: "Trabajador actualizado", worker: updated });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Conflict", message: "Ya existe un trabajador con ese RUT" });
    }
    console.error("Error al actualizar trabajador:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al actualizar el trabajador" });
  }
}
