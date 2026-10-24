import { Request } from "express";

export type UserRole = "admin" | "mecanico" | "usuario" | "vendedor" | "grua";

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  /** Todos sus roles (principal + adicionales); lo completa `authenticate` con el estado actual de la BD. */
  roles?: UserRole[];
  name: string;
  /** Versión de sesión: si no coincide con la de la BD, el token queda invalidado. */
  tokenVersion?: number;
  /** Identificador único del token (permite revocarlo al cerrar sesión). */
  jti?: string;
  /** Vencimiento (segundos desde 1970), lo agrega jsonwebtoken. */
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}
