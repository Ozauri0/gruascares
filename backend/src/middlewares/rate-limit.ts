import { Request, Response } from "express";
import { rateLimit, ipKeyGenerator, type RateLimitRequestHandler } from "express-rate-limit";

const MINUTE = 60 * 1000;

/** Límites por defecto (ventana en ms, máximo de peticiones). Ajustables sin tocar los controladores. */
export const RATE_LIMITS = {
  loginPerAccount: { windowMs: 15 * MINUTE, max: 10 }, // IP + correo
  loginPerIp: { windowMs: 15 * MINUTE, max: 100 },
  register: { windowMs: 60 * MINUTE, max: 10 },
  publicAppointment: { windowMs: 60 * MINUTE, max: 10 },
  availability: { windowMs: MINUTE, max: 60 },
} as const;

type Limit = { windowMs: number; max: number };

function build(limit: Limit, message: string, keyGenerator?: (req: Request) => string): RateLimitRequestHandler {
  return rateLimit({
    windowMs: limit.windowMs,
    limit: limit.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyGenerator ?? ((req) => ipKeyGenerator(req.ip ?? "unknown")),
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ error: "Too Many Requests", message });
    },
  });
}

function emailOf(req: Request): string {
  const email = req.body?.email;
  return typeof email === "string" ? email.toLowerCase().trim().slice(0, 255) : "";
}

/**
 * Crea un conjunto nuevo de limitadores (almacenados en memoria del proceso).
 * Se crea uno por aplicación para que las pruebas no compartan contadores.
 */
export function createRateLimiters(overrides: Partial<typeof RATE_LIMITS> = {}) {
  const limits = { ...RATE_LIMITS, ...overrides };
  return {
    loginPerAccount: build(
      limits.loginPerAccount,
      "Demasiados intentos de inicio de sesión. Espera unos minutos antes de intentarlo de nuevo.",
      (req) => `${ipKeyGenerator(req.ip ?? "unknown")}|${emailOf(req)}`
    ),
    loginPerIp: build(limits.loginPerIp, "Demasiados intentos desde esta red. Inténtalo más tarde."),
    register: build(limits.register, "Demasiados registros desde esta red. Inténtalo más tarde."),
    publicAppointment: build(
      limits.publicAppointment,
      "Has enviado muchas solicitudes de agendamiento. Si es urgente, llámanos al +56 9 9162 7809."
    ),
    availability: build(limits.availability, "Demasiadas consultas de disponibilidad. Espera un momento."),
  };
}
