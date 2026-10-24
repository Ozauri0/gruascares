import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/env.js";
import healthRouter from "./routes/health.routes.js";
import authRouter from "./routes/auth.routes.js";
import emailRouter from "./routes/email.routes.js";
import appointmentRouter from "./routes/appointment.routes.js";
import vehicleRouter from "./routes/vehicle.routes.js";
import mechanicRouter from "./routes/mechanic.routes.js";
import adminRouter from "./routes/admin.routes.js";
import clientRouter from "./routes/client.routes.js";
import workerRouter from "./routes/worker.routes.js";
import { getPublicContent } from "./controllers/content.controller.js";
import { getPublicCatalog } from "./controllers/catalog.controller.js";
import { createRateLimiters, RATE_LIMITS } from "./middlewares/rate-limit.js";
import { logAudit } from "./services/audit/audit.service.js";
import { demoLogin } from "./controllers/auth.controller.js";

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedOrigin(origin: string): boolean {
  if (config.corsOrigins.includes(origin)) return true;
  return !config.isProduction && LOCALHOST_ORIGIN.test(origin);
}

export interface AppOptions {
  rateLimits?: Partial<typeof RATE_LIMITS>;
  /** Fuerza el login demo (por defecto sigue DEMO_MODE). Solo para pruebas. */
  demoMode?: boolean;
  /** Redis para los límites de tasa (por defecto REDIS_URL). Solo para pruebas. */
  redisUrl?: string;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const limiters = createRateLimiters(options.rateLimits, options.redisUrl ?? config.redisUrl);

  // Middleware de Seguridad HTTP
  app.use(helmet());

  app.set("trust proxy", config.trustProxy);

  // CORS: solo orígenes explícitos. En desarrollo/pruebas además se acepta localhost.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Origen no permitido por la política de CORS",
      });
    }
    return next();
  });
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // Parseo de cookies, JSON y urlencoded
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Logging básico de peticiones en consola
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Toda respuesta 5xx queda en el registro de actividad para controlar errores (sin cuerpo ni cabeceras).
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () => {
      if (res.statusCode < 500) return;
      logAudit({
        action: "SERVER_ERROR",
        entityType: "http",
        entityId: `${req.method} ${req.path}`.slice(0, 100),
        details: { method: req.method, path: req.originalUrl.split("?")[0], status: res.statusCode, message: res.locals.errorMessage },
        req,
      });
    });
    next();
  });

  // Límites de tasa (antes de los routers para cortar abusos tempranamente)
  app.post("/api/auth/login", limiters.loginPerIp, limiters.loginPerAccount);
  app.post("/api/auth/register", limiters.register, limiters.registerPerRut);
  app.post("/api/auth/forgot-password", limiters.forgotPassword);
  app.post("/api/auth/reset-password", limiters.resetPassword);
  app.post("/api/auth/resend-verification", limiters.forgotPassword);
  app.post("/api/auth/verify-email", limiters.resetPassword);
  app.post("/api/appointments", limiters.publicAppointment);
  app.get("/api/appointments/availability", limiters.availability);

  // Login demo sin credenciales: solo existe con DEMO_MODE=true (nunca en producción).
  if (options.demoMode ?? config.demoMode) {
    app.post("/api/auth/demo-login", limiters.loginPerIp, demoLogin);
  }

  // Rutas
  app.use("/", healthRouter);
  app.use("/api", healthRouter);
  app.use("/api/auth", authRouter);
  // Utilidades de correo solo fuera de producción (y siempre solo para administradores).
  if (!config.isProduction) {
    app.use("/api/email", emailRouter);
  }
  app.use("/api/appointments", appointmentRouter);
  app.use("/api/clients", clientRouter);
  app.use("/api/workers", workerRouter);
  app.use("/api/vehicles", vehicleRouter);
  app.use("/api/mechanic", mechanicRouter);
  app.get("/api/catalog", limiters.catalog, getPublicCatalog);
  app.get("/api/content", limiters.content, getPublicContent);
  // Imágenes subidas por el administrador (nombres aleatorios e inmutables).
  app.use(
    "/api/uploads",
    express.static(config.uploadsDir, {
      index: false,
      dotfiles: "ignore",
      immutable: true,
      maxAge: "30d",
      setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    })
  );
  app.use("/api/admin", adminRouter);

  // Manejador de rutas no encontradas (404)
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: "Not Found",
      message: "La ruta solicitada no existe en este servidor",
    });
  });

  // Manejador de errores global
  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "Payload Too Large", message: "El archivo supera el tamaño máximo permitido" });
    }
    console.error("Unhandled error:", err);
    res.locals.errorMessage = String(err.message || err).slice(0, 300);
    res.status(500).json({
      error: "Internal Server Error",
      message: config.isProduction ? "Ha ocurrido un error inesperado" : err.message,
    });
  });

  return app;
}
