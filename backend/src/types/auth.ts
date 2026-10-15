import { Request } from "express";

export type UserRole = "admin" | "mecanico" | "usuario";

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
  /** Versión de sesión: si no coincide con la de la BD, el token queda invalidado. */
  tokenVersion?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}
