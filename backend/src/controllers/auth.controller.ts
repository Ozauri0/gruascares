import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { generateToken } from "../utils/jwt.js";
import { config } from "../config/env.js";
import { sendWelcomeEmail } from "../services/email/email.service.js";

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

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        error: "Bad Request",
        message: "La contraseña debe tener al menos 6 caracteres",
      });
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
    const passwordHash = await bcrypt.hash(password, 10);

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

    // 5. Enviar correo de bienvenida (asíncrono, fire-and-forget)
    sendWelcomeEmail(newUser.email, newUser.name);

    // 6. Generar JWT y establecer cookie HTTP-only
    const token = generateToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      name: newUser.name,
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });

    return res.status(201).json({
      message: "Usuario registrado exitosamente",
      user: newUser,
      token,
    });
  } catch (error) {
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

    if (!email || !password) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Correo y contraseña son obligatorios",
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // 1. Buscar usuario
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Credenciales inválidas",
      });
    }

    // 2. Verificar estado activo
    if (!user.isActive) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Tu cuenta ha sido desactivada. Comunícate con Grúas Cares.",
      });
    }

    // 3. Comparar contraseñas
    const passwordMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Credenciales inválidas",
      });
    }

    // 4. Generar token y cookie
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });

    return res.status(200).json({
      message: "Inicio de sesión exitoso",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
      token,
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
    secure: config.nodeEnv === "production",
    sameSite: "lax",
  });

  return res.status(200).json({
    message: "Sesión cerrada exitosamente",
  });
}
