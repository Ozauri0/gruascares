import { Request } from "express";

export type UserRole = "admin" | "mecanico" | "usuario";

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}
