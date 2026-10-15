import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });

// Valores de ejemplo conocidos que nunca deben usarse como secreto real.
const KNOWN_WEAK_SECRETS = new Set([
  "default_jwt_secret_change_me",
  "super_secret_jwt_key_gruas_cares_cambiar_en_produccion",
  "changeme",
  "secret",
]);

const MIN_SECRET_LENGTH = 32;

export interface AppConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  corsOrigins: string[];
  databaseUrl: string;
  trustProxy: boolean | number;
  /** Login demo sin credenciales (POST /api/auth/demo-login). Solo fuera de producción. */
  demoMode: boolean;
  /** URL pública del frontend (enlaces de los correos). */
  appUrl: string;
  jwt: { secret: string; expiresIn: string };
  email: { host: string; port: number; user: string; pass: string; from: string };
}

function parseTrustProxy(raw: string | undefined): boolean | number {
  if (!raw || raw === "false") return false;
  if (raw === "true") return true;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops >= 0 ? hops : false;
}

/**
 * Construye la configuración a partir de variables de entorno.
 * Si NODE_ENV no está definido se asume "production" (la opción segura).
 * En producción falla al arrancar si falta algún valor crítico.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || "production";
  const isProduction = nodeEnv === "production";

  const corsOrigins = (env.CORS_ORIGIN || (isProduction ? "" : "http://localhost:3000"))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const databaseUrl = env.DATABASE_URL || "";
  const demoMode = env.DEMO_MODE === "true";

  let secret = env.JWT_SECRET || "";
  if (isProduction) {
    const problems: string[] = [];
    if (demoMode) problems.push("DEMO_MODE=true no está permitido en producción (permite entrar sin credenciales)");
    if (!secret) problems.push("JWT_SECRET es obligatorio");
    else if (secret.length < MIN_SECRET_LENGTH) problems.push(`JWT_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres`);
    else if (KNOWN_WEAK_SECRETS.has(secret)) problems.push("JWT_SECRET usa un valor de ejemplo conocido");
    if (!databaseUrl) problems.push("DATABASE_URL es obligatorio");
    if (corsOrigins.length === 0) problems.push("CORS_ORIGIN es obligatorio (lista de orígenes separados por coma)");
    if (problems.length > 0) {
      throw new Error(`Configuración inválida para producción:\n - ${problems.join("\n - ")}`);
    }
  } else if (!secret || KNOWN_WEAK_SECRETS.has(secret)) {
    // Desarrollo/pruebas: secreto efímero (las sesiones se invalidan al reiniciar el servidor).
    secret = crypto.randomBytes(48).toString("base64");
    console.warn("⚠️  JWT_SECRET no definido o de ejemplo: se usa un secreto temporal para esta ejecución.");
  }

  return {
    port: Number(env.PORT) || 4000,
    nodeEnv,
    isProduction,
    corsOrigins,
    databaseUrl,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    demoMode,
    appUrl: (env.APP_URL || (isProduction ? "https://gruascares.cl" : "http://localhost:3000")).replace(/\/$/, ""),
    jwt: { secret, expiresIn: env.JWT_EXPIRES_IN || "7d" },
    email: {
      host: env.SMTP_HOST || "",
      port: Number(env.SMTP_PORT) || 587,
      user: env.SMTP_USER || "",
      pass: env.SMTP_PASS || "",
      from: env.EMAIL_FROM || "Grúas Cares <contacto@gruascares.cl>",
    },
  };
}

export const config = loadConfig();
