import { Request, Response } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { appointments, users } from "../db/schema.js";
import { generateToken } from "../utils/jwt.js";
import { config } from "../config/env.js";
import { sendWelcomeEmail } from "../services/email/email.service.js";
import { MAX_LEN, findTooLong } from "../utils/validate.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { hashPassword, validatePassword, verifyPassword } from "../utils/password.js";
import { logAudit } from "../services/audit/audit.service.js";
import { DEMO_ACCOUNTS, isDemoEmail } from "../config/demo.js";
import type { UserRole } from "../types/auth.js";

const COOKIE_NAME = "gc_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días en ms

export async function register(req: Request, res: Response) {
  try {
    const { name, email, password, phone } = req.body;

    // 1. Validaciones básicas de entrada
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El nombre es obligatorio y debe tener al menos 2 caracteres",
      });
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Debe ingresar un correo electrónico válido",
      });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: "Bad Request", message: passwordError });
    }

    const tooLong = findTooLong([
      ["El nombre", name, MAX_LEN.name],
      ["El correo", email, MAX_LEN.email],
      ["El teléfono", phone, MAX_LEN.phone],
    ]);
    if (tooLong) {
      return res.status(400).json({ error: "Bad Request", message: tooLong });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Verificar si el correo ya existe
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({
        error: "Conflict",
        message: "Ya existe una cuenta registrada con este correo electrónico",
      });
    }

    // 3. Hashear contraseña
    const passwordHash = await hashPassword(password);

    // 4. Insertar usuario con rol 'usuario'
    const [newUser] = await db
      .insert(users)
      .values({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: "usuario",
        phone: phone ? String(phone).trim() : null,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        phone: users.phone,
        createdAt: users.createdAt,
      });

    // 4.1 Vincular solicitudes hechas como invitado con este mismo correo
    await db
      .update(appointments)
      .set({ userId: newUser.id, guestName: null, guestEmail: null, guestPhone: null })
      .where(and(isNull(appointments.userId), eq(sql`lower(${appointments.guestEmail})`, normalizedEmail)));

    logAudit({
      userId: newUser.id,
      userEmail: newUser.email,
      action: "USER_REGISTER",
      entityType: "user",
      entityId: newUser.id,
      req,
    });

    // 5. Enviar correo de bienvenida (asíncrono, fire-and-forget)
    sendWelcomeEmail(newUser.email, newUser.name);

    // 6. Generar JWT y establecer cookie HTTP-only
    const token = generateToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      name: newUser.name,
      tokenVersion: 0,
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });

    return res.status(201).json({
      message: "Usuario registrado exitosamente",
      user: newUser,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({
        error: "Conflict",
        message: "Ya existe una cuenta registrada con este correo electrónico",
      });
    }
    console.error("Error en register:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al registrar usuario",
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Correo y contraseña son obligatorios",
      });
    }

    const normalizedEmail = email.toLowerCase().trim().slice(0, MAX_LEN.email);

    // 1. Buscar usuario y verificar la contraseña SIEMPRE (con hash ficticio si no existe):
    // misma respuesta y mismo tiempo para "no existe" y "clave incorrecta".
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    const passwordMatch = await verifyPassword(password, user?.passwordHash);

    if (!user || !passwordMatch) {
      logAudit({
        userId: user?.id,
        userEmail: normalizedEmail,
        action: "LOGIN_FAILED",
        entityType: "user",
        entityId: user?.id,
        details: { reason: user ? "bad_password" : "unknown_user" },
        req,
      });
      return res.status(401).json({
        error: "Unauthorized",
        message: "Credenciales inválidas",
      });
    }

    // 2. Cuenta desactivada: solo se informa a quien demostró conocer la contraseña.
    if (!user.isActive) {
      logAudit({ userId: user.id, userEmail: user.email, action: "LOGIN_BLOCKED", entityType: "user", entityId: user.id, details: { reason: "inactive" }, req });
      return res.status(403).json({
        error: "Forbidden",
        message: "Tu cuenta ha sido desactivada. Comunícate con Grúas Cares.",
      });
    }

    // 4. Generar token y cookie
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tokenVersion: user.tokenVersion,
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });

    logAudit({ userId: user.id, userEmail: user.email, action: "LOGIN", entityType: "user", entityId: user.id, req });

    return res.status(200).json({
      message: "Inicio de sesión exitoso",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al iniciar sesión",
    });
  }
}

export async function getMe(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No autenticado",
      });
    }

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        phone: users.phone,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({
        error: "Not Found",
        message: "Usuario no encontrado",
      });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Error en getMe:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al obtener perfil",
    });
  }
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
  });

  return res.status(200).json({
    message: "Sesión cerrada exitosamente",
  });
}

/**
 * POST /api/auth/logout-all
 * Cierra todas las sesiones activas del usuario (en todos los dispositivos).
 */
export async function logoutAll(req: Request, res: Response) {
  try {
    await db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, req.user!.userId));

    logAudit({ action: "LOGOUT_ALL", entityType: "user", entityId: req.user!.userId, req });

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: "lax",
    });
    return res.status(200).json({ message: "Se cerraron todas tus sesiones" });
  } catch (error) {
    console.error("Error en logoutAll:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al cerrar las sesiones",
    });
  }
}

/**
 * POST /api/auth/demo-login { role }
 * SOLO DEMO (DEMO_MODE=true): abre sesión real como la cuenta demo del rol indicado, sin pedir credenciales.
 * Se elimina antes de producción (issue #47).
 */
export async function demoLogin(req: Request, res: Response) {
  try {
    const role = req.body?.role as UserRole | undefined;
    if (!role || !Object.prototype.hasOwnProperty.call(DEMO_ACCOUNTS, role)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "role debe ser uno de: usuario, mecanico, admin",
      });
    }

    const email = DEMO_ACCOUNTS[role];
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // Solo cuentas del dominio reservado de demo y con el rol esperado (nunca cuentas reales).
    if (!user || !user.isActive || !isDemoEmail(user.email) || user.role !== role) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Los usuarios demo no están disponibles. Ejecuta `bun run db:seed` en el backend.",
      });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tokenVersion: user.tokenVersion,
    });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });

    logAudit({ userId: user.id, userEmail: user.email, action: "DEMO_LOGIN", entityType: "user", entityId: user.id, req });

    return res.status(200).json({
      message: "Sesión demo iniciada",
      demo: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone },
    });
  } catch (error) {
    console.error("Error en demoLogin:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al iniciar la sesión demo" });
  }
}
