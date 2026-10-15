import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { verifyToken } from "../utils/jwt.js";
import { JWTPayload, UserRole } from "../types/auth.js";

function extractToken(req: Request): string | undefined {
  // 1. Cookie HTTP-only; 2. cabecera Authorization: Bearer <token>
  let token: string | undefined = req.cookies?.gc_token;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.substring(7);
  }
  return token;
}

/**
 * Valida el token y lo contrasta con la BD: el usuario debe existir, estar activo y
 * su versión de sesión debe coincidir. El rol que se usa es el actual de la BD (no el del token).
 */
async function resolveUser(token: string): Promise<JWTPayload | null> {
  const payload = verifyToken(token);
  if (!payload) return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      tokenVersion: users.tokenVersion,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!user || !user.isActive) return null;
  if ((payload.tokenVersion ?? 0) !== user.tokenVersion) return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tokenVersion: user.tokenVersion,
  };
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "No autenticado: Token no proporcionado",
    });
  }

  try {
    const user = await resolveUser(token);
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Sesión inválida o expirada",
      });
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const user = await resolveUser(token);
    if (user) req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No autenticado",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Acceso denegado: se requiere uno de los roles [${allowedRoles.join(", ")}]`,
      });
    }

    return next();
  };
}
