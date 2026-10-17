import { Request, Response } from "express";
import { rateLimit, ipKeyGenerator, type RateLimitRequestHandler, type Store, type Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";
import { config } from "../config/env.js";

const MINUTE = 60 * 1000;

type Limit = { windowMs: number; max: number };

/** Límites por defecto (ventana en ms, máximo de peticiones). Ajustables sin tocar los controladores. */
export const RATE_LIMITS: Record<"loginPerAccount" | "loginPerIp" | "register" | "publicAppointment" | "availability" | "catalog" | "content" | "forgotPassword" | "resetPassword", Limit> = {
  loginPerAccount: { windowMs: 15 * MINUTE, max: 10 }, // IP + correo
  loginPerIp: { windowMs: 15 * MINUTE, max: 100 },
  register: { windowMs: 60 * MINUTE, max: 10 },
  publicAppointment: { windowMs: 60 * MINUTE, max: 30 }, // por red; ahora todas las solicitudes exigen sesión
  availability: { windowMs: MINUTE, max: 60 },
  catalog: { windowMs: MINUTE, max: 120 },
  content: { windowMs: MINUTE, max: 1200 }, // lo consulta el servidor del sitio en cada página
  forgotPassword: { windowMs: 60 * MINUTE, max: 5 }, // IP + correo
  resetPassword: { windowMs: 60 * MINUTE, max: 10 },
};

/** Cliente Redis compartido (se crea una vez, solo si hay REDIS_URL). */
type RedisClient = ReturnType<typeof createClient>;
const redisClients = new Map<string, { client: RedisClient; ready: Promise<unknown>; createdAt: number }>();

function redisClient(url: string) {
  let entry = redisClients.get(url);
  if (!entry) {
    let client: RedisClient;
    client = createClient({
      url,
      // Sin cola de espera: con Redis caído las operaciones fallan al instante (y se decide abrir o cerrar), no se cuelgan.
      disableOfflineQueue: true,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5000) },
    });
    // Sin este manejador un corte de Redis tumbaría el proceso; cada operación fallida se trata en el limitador.
    client.on("error", (error) => console.error("❌ [Redis] ", error.message));
    const ready = client.connect().catch((error) => console.error("❌ [Redis] No se pudo conectar:", error.message));
    entry = { client, ready, createdAt: Date.now() };
    redisClients.set(url, entry);
  }
  return entry;
}

/**
 * Almacén de contadores en Redis. El `RedisStore` real se crea la primera vez que se usa, ya con Redis conectado
 * (al crearse carga scripts en Redis: con Redis caído al arrancar eso fallaría sin que nadie lo atrape).
 */
class LazyRedisStore implements Store {
  localKeys = false;
  prefix: string;
  private options: Options | undefined;
  private inner: RedisStore | undefined;

  constructor(
    private readonly name: string,
    private readonly redisUrl: string
  ) {
    this.prefix = `gc:rl:${name}:`;
  }

  init(options: Options) {
    this.options = options;
  }

  private async store(): Promise<RedisStore> {
    if (this.inner) return this.inner;
    const { client, ready, createdAt } = redisClient(this.redisUrl);
    if (!client.isReady) {
      // Solo se espera la conexión inicial (máx. 1 s tras crear el cliente); con Redis caído después, falla al instante.
      if (Date.now() - createdAt < 1000) await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 1000))]);
      if (!client.isReady) throw new Error("Redis no disponible");
    }
    const created = new RedisStore({ prefix: this.prefix, sendCommand: (...args: string[]) => client.sendCommand(args) as Promise<never> });
    if (this.options) created.init(this.options);
    this.inner = created;
    return created;
  }

  async increment(key: string) {
    return (await this.store()).increment(key);
  }
  async decrement(key: string) {
    return (await this.store()).decrement(key);
  }
  async resetKey(key: string) {
    return (await this.store()).resetKey(key);
  }
  async get(key: string) {
    return (await this.store()).get(key);
  }
}

/** Almacén de contadores en Redis (cada limitador con su prefijo); sin Redis devuelve undefined (memoria). */
function redisStoreFor(name: string, redisUrl: string): Store | undefined {
  return redisUrl ? new LazyRedisStore(name, redisUrl) : undefined;
}

/**
 * Si el almacén (Redis) falla: los limitadores "estrictos" (login, registro y recuperación) rechazan con 429 y
 * los demás dejan pasar, para que un corte de Redis no tumbe todo el sitio ni deje sin protección lo sensible.
 */
function failClosed(limiter: RateLimitRequestHandler, message: string) {
  return (req: Request, res: Response, next: (err?: unknown) => void) =>
    limiter(req, res, (error?: unknown) => {
      if (error) return res.status(429).json({ error: "Too Many Requests", message });
      return next();
    });
}

function build(limit: Limit, message: string, keyGenerator?: (req: Request) => string, store?: Store, strict = false) {
  const limiter = rateLimit({
    windowMs: limit.windowMs,
    limit: limit.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyGenerator ?? ((req) => ipKeyGenerator(req.ip ?? "unknown")),
    ...(store ? { store, passOnStoreError: !strict } : {}),
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ error: "Too Many Requests", message });
    },
  });
  return strict && store ? failClosed(limiter, "No pudimos verificar tus intentos ahora. Inténtalo de nuevo en unos minutos.") : limiter;
}

function emailOf(req: Request): string {
  const email = req.body?.email;
  return typeof email === "string" ? email.toLowerCase().trim().slice(0, 255) : "";
}

/**
 * Crea un conjunto nuevo de limitadores. Sin REDIS_URL los contadores viven en la memoria del proceso (una sola
 * instancia); con REDIS_URL se comparten entre instancias y reinicios. Se crea uno por aplicación para que las
 * pruebas no compartan contadores.
 */
export function createRateLimiters(overrides: Partial<typeof RATE_LIMITS> = {}, redisUrl: string = config.redisUrl) {
  const limits = { ...RATE_LIMITS, ...overrides };
  const store = (name: string) => redisStoreFor(name, redisUrl);
  return {
    loginPerAccount: build(
      limits.loginPerAccount,
      "Demasiados intentos de inicio de sesión. Espera unos minutos antes de intentarlo de nuevo.",
      (req) => `${ipKeyGenerator(req.ip ?? "unknown")}|${emailOf(req)}`,
      store("loginPerAccount"),
      true
    ),
    loginPerIp: build(limits.loginPerIp, "Demasiados intentos desde esta red. Inténtalo más tarde.", undefined, store("loginPerIp"), true),
    register: build(limits.register, "Demasiados registros desde esta red. Inténtalo más tarde.", undefined, store("register"), true),
    publicAppointment: build(
      limits.publicAppointment,
      "Has enviado muchas solicitudes de agendamiento. Si es urgente, llámanos al +56 9 9162 7809.",
      undefined,
      store("publicAppointment")
    ),
    availability: build(limits.availability, "Demasiadas consultas de disponibilidad. Espera un momento.", undefined, store("availability")),
    forgotPassword: build(
      limits.forgotPassword,
      "Solicitaste varios enlaces seguidos. Revisa tu correo o inténtalo más tarde.",
      (req) => `${ipKeyGenerator(req.ip ?? "unknown")}|${emailOf(req)}`,
      store("forgotPassword"),
      true
    ),
    resetPassword: build(limits.resetPassword, "Demasiados intentos. Solicita un nuevo enlace e inténtalo más tarde.", undefined, store("resetPassword"), true),
    catalog: build(limits.catalog, "Demasiadas consultas al catálogo. Espera un momento.", undefined, store("catalog")),
    content: build(limits.content, "Demasiadas consultas. Espera un momento.", undefined, store("content")),
  };
}
