import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { workers } from "../db/schema.js";
import type { ServiceCategory } from "./roles.js";
import { hasRole } from "./roles.js";
import type { UserRole } from "../types/auth.js";

export type WorkerType = "mecanico" | "gruero";
export const WORKER_TYPES: readonly WorkerType[] = ["mecanico", "gruero"];

/** Tipo de trabajador que atiende cada categoría de servicio. */
export const WORKER_TYPE_FOR: Record<ServiceCategory, WorkerType> = { serviteca: "mecanico", grua: "gruero" };

export const isWorkerType = (value: unknown): value is WorkerType => typeof value === "string" && (WORKER_TYPES as readonly string[]).includes(value);

/** Tipos de trabajador que gestiona esta cuenta: el jefe de taller ve mecánicos, el de grúas ve grueros y el admin ambos. */
export function managedWorkerTypes(user: { role: UserRole; extraRoles?: UserRole[] | null; roles?: UserRole[] | null } | undefined): WorkerType[] {
  if (!user) return [];
  if (hasRole(user, "admin")) return [...WORKER_TYPES];
  const types: WorkerType[] = [];
  if (hasRole(user, "mecanico")) types.push("mecanico");
  if (hasRole(user, "grua")) types.push("gruero");
  return types;
}

/** Trabajador activo que puede atender servicios de la categoría; si no, el motivo para mostrarlo al usuario. */
export async function findAssignableWorker(workerId: string, category: ServiceCategory) {
  const [worker] = await db.select().from(workers).where(eq(workers.id, workerId)).limit(1);
  if (!worker) return { error: "El trabajador indicado no existe" as const };
  if (!worker.isActive) return { error: "El trabajador indicado está inactivo" as const };
  if (!worker.types.includes(WORKER_TYPE_FOR[category])) {
    return {
      error: (category === "grua" ? "El trabajador indicado no es gruero" : "El trabajador indicado no es mecánico") as string,
    };
  }
  return { worker };
}
