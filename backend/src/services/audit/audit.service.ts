import { Request } from "express";
import { db } from "../../db/connection.js";
import { auditLogs } from "../../db/schema.js";

export interface AuditLogOptions {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, any> | string | null;
  ipAddress?: string | null;
  req?: Request;
}

/**
 * Registra una acción crítica de forma asíncrona y estructurada ("fire-and-forget").
 * Nunca bloquea el flujo principal ni arroja errores hacia el cliente HTTP.
 */
export async function logAudit(options: AuditLogOptions): Promise<void> {
  try {
    let finalUserId = options.userId || null;
    let finalUserEmail = options.userEmail || null;
    let finalIp = options.ipAddress || null;

    if (options.req) {
      if (options.req.user) {
        finalUserId = finalUserId || options.req.user.userId;
        finalUserEmail = finalUserEmail || options.req.user.email;
      }
      // req.ip respeta "trust proxy"; no se lee x-forwarded-for directamente (es falsificable).
      finalIp = finalIp || options.req.ip || options.req.socket.remoteAddress || null;
    }

    if (finalIp) finalIp = finalIp.slice(0, 50);
    if (finalUserEmail) finalUserEmail = finalUserEmail.slice(0, 255);

    const serializedDetails =
      options.details && typeof options.details === "object"
        ? JSON.stringify(options.details)
        : (options.details as string) || null;

    await db.insert(auditLogs).values({
      userId: finalUserId,
      userEmail: finalUserEmail,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId || null,
      details: serializedDetails,
      ipAddress: finalIp,
    });

    console.log(
      `🛡️ [AuditLog] ${new Date().toISOString()} | Action: ${options.action} | User: ${
        finalUserEmail || "system"
      } | Entity: ${options.entityType}:${options.entityId || "N/A"}`
    );
  } catch (error) {
    console.error("❌ [AuditLog] Error al registrar evento de auditoría:", error);
  }
}
