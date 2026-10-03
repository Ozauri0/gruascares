import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config/env.js";
import { JWTPayload } from "../types/auth.js";

export function generateToken(payload: JWTPayload): string {
  const options: SignOptions = {
    expiresIn: config.jwt.expiresIn as any,
  };
  return jwt.sign(payload, config.jwt.secret, options);
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
  } catch {
    return null;
  }
}
