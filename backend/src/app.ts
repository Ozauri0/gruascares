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
import { getPublicCatalog } from "./controllers/catalog.controller.js";
import { createRateLimiters, RATE_LIMITS } from "./middlewares/rate-limit.js";
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
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const limiters = createRateLimiters(options.rateLimits);

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

  // Límites de tasa (antes de los routers para cortar abusos tempranamente)
  app.post("/api/auth/login", limiters.loginPerIp, limiters.loginPerAccount);
  app.post("/api/auth/register", limiters.register);
  app.post("/api/auth/forgot-password", limiters.forgotPassword);
  app.post("/api/auth/reset-password", limiters.resetPassword);
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
  app.use("/api/vehicles", vehicleRouter);
  app.use("/api/mechanic", mechanicRouter);
  app.get("/api/catalog", limiters.catalog, getPublicCatalog);
  app.use("/api/admin", adminRouter);

  // Manejador de rutas no encontradas (404)
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: "Not Found",
      message: "La ruta solicitada no existe en este servidor",
    });
  });

  // Manejador de errores global
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: config.isProduction ? "Ha ocurrido un error inesperado" : err.message,
    });
  });

  return app;
}
