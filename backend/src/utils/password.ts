import bcrypt from "bcryptjs";

/** Costo de bcrypt (configurable; las pruebas usan un valor bajo para ir rápido). */
export const BCRYPT_ROUNDS = Math.min(14, Math.max(4, Number(process.env.BCRYPT_ROUNDS) || 12));

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt solo considera los primeros 72 bytes: se rechaza todo lo que excede para no truncar en silencio. */
export const PASSWORD_MAX_BYTES = 72;

/** Devuelve un mensaje de error si la contraseña no cumple la política, o null si es válida. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    return `La contraseña no puede superar los ${PASSWORD_MAX_BYTES} bytes (aprox. ${PASSWORD_MAX_BYTES} caracteres)`;
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

let dummyHash: Promise<string> | null = null;

/**
 * Compara la contraseña con el hash. Si no hay hash (usuario inexistente) compara contra uno falso
 * con el mismo costo, para que el tiempo de respuesta no revele si la cuenta existe.
 */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) return false;
  if (!hash) {
    dummyHash ??= bcrypt.hash("password-ficticia-para-igualar-tiempos", BCRYPT_ROUNDS);
    await bcrypt.compare(password, await dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}
