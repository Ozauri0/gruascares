import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/env.js";
import healthRouter from "./routes/health.routes.js";
import authRouter from "./routes/auth.routes.js";
import emailRouter from "./routes/email.routes.js";
import appointmentRouter from "./routes/appointment.routes.js";

export function createApp(): Express {
  const app = express();

  // Middleware de Seguridad HTTP
  app.use(helmet());

  // Configuración de CORS segura
  app.use(
    cors({
      origin: (origin, callback) => {
        // Permitir peticiones sin origin (como herramientas internas, curl o móviles)
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin) || config.nodeEnv === "development") {
          return callback(null, true);
        }
        return callback(new Error("Origen no permitido por la política de CORS"));
      },
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

  // Rutas
  app.use("/", healthRouter);
  app.use("/api", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/email", emailRouter);
  app.use("/api/appointments", appointmentRouter);

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
      message: config.nodeEnv === "development" ? err.message : "Ha ocurrido un error inesperado",
    });
  });

  return app;
}
