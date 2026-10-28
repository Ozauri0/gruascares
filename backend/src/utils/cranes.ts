import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { cranes } from "../db/schema.js";

/** Grúa activa de la flota que se puede asignar a un servicio; si no, el motivo para mostrarlo al usuario. */
export async function findAssignableCrane(craneId: string) {
  const [crane] = await db.select().from(cranes).where(eq(cranes.id, craneId)).limit(1);
  if (!crane) return { error: "La grúa indicada no existe" as const };
  if (!crane.isActive) return { error: "La grúa indicada está de baja" as const };
  return { crane };
}
