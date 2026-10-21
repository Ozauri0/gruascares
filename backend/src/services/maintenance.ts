import { and, eq, gt, isNotNull, isNull, lt, notExists, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { appointments, auditLogs, emailVerificationTokens, revokedTokens, users, vehicles } from "../db/schema.js";
import { config } from "../config/env.js";
import { logAudit } from "./audit/audit.service.js";

/** Horas de gracia para confirmar el correo (igual a la vigencia del enlace de confirmación). */
export const UNVERIFIED_ACCOUNT_HOURS = 24;

/** Borra los registros de actividad con más de `months` meses. Devuelve cuántos eliminó. */
export async function purgeAuditLogs(months: number = config.auditRetentionMonths, now: Date = new Date()): Promise<number> {
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - months);
  const removed = await db.delete(auditLogs).where(lt(auditLogs.createdAt, limit)).returning({ id: auditLogs.id });
  return removed.length;
}

/**
 * Elimina las cuentas registradas por el sitio que nunca confirmaron su correo: pasaron más de 24 horas desde que se
 * crearon y ya no tienen ningún enlace de confirmación vigente (un reenvío reinicia el plazo). No toca cuentas
 * confirmadas, perfiles presenciales sin contraseña ni perfiles que ya tengan vehículos o citas registradas.
 */
export async function purgeUnverifiedAccounts(now: Date = new Date()): Promise<number> {
  const createdBefore = new Date(now.getTime() - UNVERIFIED_ACCOUNT_HOURS * 60 * 60 * 1000);
  const removed = await db
    .delete(users)
    .where(
      and(
        isNull(users.emailVerifiedAt),
        isNotNull(users.passwordHash),
        eq(users.role, "usuario"),
        lt(users.createdAt, createdBefore),
        notExists(
          db
            .select({ one: sql`1` })
            .from(emailVerificationTokens)
            .where(
              and(
                eq(emailVerificationTokens.userId, users.id),
                isNull(emailVerificationTokens.usedAt),
                gt(emailVerificationTokens.expiresAt, now)
              )
            )
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(vehicles)
            .where(eq(vehicles.userId, users.id))
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(appointments)
            .where(eq(appointments.userId, users.id))
        )
      )
    )
    .returning({ id: users.id });
  return removed.length;
}

/** Quita los identificadores de sesiones cerradas cuyo token ya venció (ya no hace falta recordarlos). */
export async function purgeRevokedTokens(now: Date = new Date()): Promise<number> {
  const removed = await db.delete(revokedTokens).where(lt(revokedTokens.expiresAt, now)).returning({ jti: revokedTokens.jti });
  return removed.length;
}

/** Ejecuta toda la limpieza periódica; cada paso falla por separado sin detener a los demás. */
export async function runMaintenance(now: Date = new Date()): Promise<{ auditLogs: number; unverifiedAccounts: number; revokedTokens: number }> {
  const result = { auditLogs: 0, unverifiedAccounts: 0, revokedTokens: 0 };
  const steps: [keyof typeof result, () => Promise<number>][] = [
    ["revokedTokens", () => purgeRevokedTokens(now)],
    ["unverifiedAccounts", () => purgeUnverifiedAccounts(now)],
    ["auditLogs", () => purgeAuditLogs(config.auditRetentionMonths, now)],
  ];
  for (const [key, step] of steps) {
    try {
      result[key] = await step();
    } catch (error) {
      console.error(`❌ [Mantenimiento] Falló la limpieza de ${key}:`, error);
    }
  }
  if (result.auditLogs + result.unverifiedAccounts > 0) {
    logAudit({ action: "MAINTENANCE_PURGE", entityType: "system", details: result });
  }
  return result;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Programa la limpieza: una vez poco después de arrancar y luego cada 24 horas. */
export function startMaintenanceJobs(): () => void {
  const run = () => void runMaintenance().catch((error) => console.error("❌ [Mantenimiento] Error:", error));
  const first = setTimeout(run, 60_000);
  const every = setInterval(run, DAY_MS);
  first.unref?.();
  every.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
