import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config/env.js";
import { JWTPayload } from "../types/auth.js";

const ALGORITHM = "HS256";

export function generateToken(payload: JWTPayload): string {
  const options: SignOptions = {
    algorithm: ALGORITHM,
    expiresIn: config.jwt.expiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, config.jwt.secret, options);
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    // Se fija el algoritmo: nunca aceptar "none" ni otros distintos del firmado por el servidor.
    return jwt.verify(token, config.jwt.secret, { algorithms: [ALGORITHM] }) as JWTPayload;
  } catch {
    return null;
  }
}
