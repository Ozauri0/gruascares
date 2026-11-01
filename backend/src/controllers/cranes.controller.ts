import { Request, Response } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { cranes, workers } from "../db/schema.js";
import { logAudit } from "../services/audit/audit.service.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { isValidChileanPlate, normalizePlate } from "../utils/plate.js";
import { MAX_LEN, findTooLong, isUuid } from "../utils/validate.js";
import { findAssignableWorker } from "../utils/workers.js";

export const CRANE_TYPES = ["plataforma", "camion_grua", "otro"] as const;
type CraneType = (typeof CRANE_TYPES)[number];
const isCraneType = (value: unknown): value is CraneType => typeof value === "string" && (CRANE_TYPES as readonly string[]).includes(value);

const publicCrane = {
  id: cranes.id,
  name: cranes.name,
  plate: cranes.plate,
  type: cranes.type,
  notes: cranes.notes,
  isActive: cranes.isActive,
  workerId: cranes.workerId,
  workerName: workers.name,
  createdAt: cranes.createdAt,
};

const selectCranes = () => db.select(publicCrane).from(cranes).leftJoin(workers, eq(workers.id, cranes.workerId));

async function findCrane(id: string) {
  const [crane] = await selectCranes().where(eq(cranes.id, id)).limit(1);
  return crane;
}

/** Valida el gruero (activo y de tipo gruero) o devuelve el motivo del rechazo. `null` quita la asignación. */
async function parseWorker(value: unknown): Promise<{ workerId: string | null } | { error: string }> {
  if (value === null || value === "") return { workerId: null };
  if (typeof value !== "string" || !isUuid(value)) return { error: "workerId debe ser un UUID válido o null" };
  const found = await findAssignableWorker(value, "grua");
  if ("error" in found) return { error: found.error as string };
  return { workerId: found.worker.id };
}

/** GET /api/cranes?active=true|false — flota completa con el gruero asignado. */
export async function listCranes(req: Request, res: Response) {
  try {
    const { active } = req.query;
    const query = selectCranes();
    const list = await (active === "true" || active === "false" ? query.where(eq(cranes.isActive, active === "true")) : query).orderBy(asc(cranes.name));
    return res.json({ cranes: list });
  } catch (error) {
    console.error("Error al listar la flota:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al consultar la flota" });
  }
}

/** POST /api/cranes { name, plate, type?, notes?, workerId? } */
export async function createCrane(req: Request, res: Response) {
  try {
    const { name, plate, type, notes, workerId } = req.body ?? {};
    if (typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ error: "Bad Request", message: "El nombre de la grúa es obligatorio (mínimo 2 caracteres)" });
    }
    if (typeof plate !== "string" || !isValidChileanPlate(plate)) {
      return res.status(400).json({ error: "Bad Request", message: "Ingresa una patente chilena válida (ej. ABCD12 o AB1234)" });
    }
    if (type !== undefined && !isCraneType(type)) {
      return res.status(400).json({ error: "Bad Request", message: "El tipo debe ser plataforma, camion_grua u otro" });
    }
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "Las notas deben ser texto" });
    }
    const tooLong = findTooLong([
      ["El nombre", name, MAX_LEN.name],
      ["Las notas", notes, MAX_LEN.notes],
    ]);
    if (tooLong) return res.status(400).json({ error: "Bad Request", message: tooLong });

    let assigned: string | null = null;
    if (workerId !== undefined) {
      const parsed = await parseWorker(workerId);
      if ("error" in parsed) return res.status(400).json({ error: "Bad Request", message: parsed.error });
      assigned = parsed.workerId;
    }

    const [created] = await db
      .insert(cranes)
      .values({
        name: name.trim(),
        plate: normalizePlate(plate),
        type: type ?? "otro",
        notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
        workerId: assigned,
        createdBy: req.user!.userId,
      })
      .returning({ id: cranes.id });

    logAudit({ action: "CRANE_CREATED", entityType: "crane", entityId: created.id, details: { name: name.trim(), plate: normalizePlate(plate), workerId: assigned }, req });
    return res.status(201).json({ message: "Grúa registrada", crane: await findCrane(created.id) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Conflict", message: "Ya existe una grúa con esa patente" });
    }
    console.error("Error al registrar la grúa:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al registrar la grúa" });
  }
}

/**
 * PATCH /api/cranes/:id { name?, plate?, type?, notes?, workerId?, isActive? }
 * `workerId: null` quita al gruero. Dar de baja no borra nada.
 */
export async function updateCrane(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ error: "Bad Request", message: "ID de grúa inválido: debe ser un UUID" });
    }
    const { name, plate, type, notes, workerId, isActive } = req.body ?? {};
    if ([name, plate, type, notes, workerId, isActive].every((v) => v === undefined)) {
      return res.status(400).json({ error: "Bad Request", message: "Indica al menos un campo a modificar (name, plate, type, notes, workerId, isActive)" });
    }
    if (name !== undefined && (typeof name !== "string" || name.trim().length < 2)) {
      return res.status(400).json({ error: "Bad Request", message: "El nombre debe tener al menos 2 caracteres" });
    }
    if (plate !== undefined && (typeof plate !== "string" || !isValidChileanPlate(plate))) {
      return res.status(400).json({ error: "Bad Request", message: "Ingresa una patente chilena válida (ej. ABCD12 o AB1234)" });
    }
    if (type !== undefined && !isCraneType(type)) {
      return res.status(400).json({ error: "Bad Request", message: "El tipo debe ser plataforma, camion_grua u otro" });
    }
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "Las notas deben ser texto" });
    }
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return res.status(400).json({ error: "Bad Request", message: "isActive debe ser verdadero o falso" });
    }
    const tooLong = findTooLong([
      ["El nombre", name, MAX_LEN.name],
      ["Las notas", notes, MAX_LEN.notes],
    ]);
    if (tooLong) return res.status(400).json({ error: "Bad Request", message: tooLong });

    const existing = await findCrane(id);
    if (!existing) return res.status(404).json({ error: "Not Found", message: "La grúa solicitada no existe" });

    const updates: Partial<typeof cranes.$inferInsert> = { updatedAt: new Date() };
    if (typeof name === "string") updates.name = name.trim();
    if (typeof plate === "string") updates.plate = normalizePlate(plate);
    if (type !== undefined) updates.type = type;
    if (notes !== undefined) updates.notes = typeof notes === "string" && notes.trim() ? notes.trim() : null;
    if (typeof isActive === "boolean") updates.isActive = isActive;
    if (workerId !== undefined) {
      const parsed = await parseWorker(workerId);
      if ("error" in parsed) return res.status(400).json({ error: "Bad Request", message: parsed.error });
      updates.workerId = parsed.workerId;
    }

    await db.update(cranes).set(updates).where(eq(cranes.id, id));

    const fields = Object.keys(updates).filter((k) => k !== "updatedAt");
    const action =
      typeof isActive === "boolean" && isActive !== existing.isActive
        ? isActive ? "CRANE_ACTIVATED" : "CRANE_DEACTIVATED"
        : workerId !== undefined && fields.length === 1 ? "CRANE_ASSIGNED" : "CRANE_UPDATED";
    logAudit({ action, entityType: "crane", entityId: id, details: { name: existing.name, plate: existing.plate, fields, ...(workerId !== undefined ? { workerId: updates.workerId ?? null } : {}) }, req });
    return res.json({ message: "Grúa actualizada", crane: await findCrane(id) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Conflict", message: "Ya existe una grúa con esa patente" });
    }
    console.error("Error al actualizar la grúa:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al actualizar la grúa" });
  }
}
