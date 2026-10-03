import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import { UserRole } from "../types/auth.js";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  // 1. Intentar obtener el token desde la cookie HTTP-only
  let token = req.cookies?.gc_token;

  // 2. Si no hay cookie, buscar en el header Authorization: Bearer <token>
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "No autenticado: Token no proporcionado",
    });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Sesión inválida o expirada",
    });
  }

  req.user = payload;
  return next();
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  let token = req.cookies?.gc_token;

  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  return next();
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
