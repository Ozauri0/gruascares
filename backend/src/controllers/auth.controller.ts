import { rolesOf, withRoles } from "../utils/roles.js";
import { Request, Response } from "express";
import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { emailVerificationTokens, passwordResetTokens, revokedTokens, users } from "../db/schema.js";
import { generateToken, verifyToken } from "../utils/jwt.js";
import { config } from "../config/env.js";
import { sendEmailVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from "../services/email/email.service.js";
import { EMAIL_REGEX, MAX_LEN, findTooLong } from "../utils/validate.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { hashPassword, validatePassword, verifyPassword } from "../utils/password.js";
import { isValidRut, normalizeRut } from "../utils/rut.js";
import { logAudit } from "../services/audit/audit.service.js";
import { DEMO_ACCOUNTS, isDemoEmail } from "../config/demo.js";
import type { UserRole } from "../types/auth.js";

const COOKIE_NAME = "gc_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días en ms

const VERIFY_TOKEN_HOURS = 24;
const hashVerifyToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Genera un enlace de confirmación de un solo uso (invalida los anteriores) y lo envía por correo. */
async function issueEmailVerification(userId: string, email: string, name: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx.update(emailVerificationTokens).set({ usedAt: new Date() }).where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)));
    await tx.insert(emailVerificationTokens).values({
      userId,
      tokenHash: hashVerifyToken(token),
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000),
    });
  });
  const url = `${config.appUrl}/confirmar-correo?token=${encodeURIComponent(token)}`;
  sendEmailVerificationEmail(email, name, url, VERIFY_TOKEN_HOURS);
}

export async function register(req: Request, res: Response) {
  try {
    const { name, rut, email, password, phone } = req.body ?? {};

    // 1. Validaciones básicas de entrada
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El nombre es obligatorio y debe tener al menos 2 caracteres",
      });
    }

    if (!rut || typeof rut !== "string" || !isValidRut(rut)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Debe ingresar un RUT chileno válido",
      });
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Debe ingresar un correo electrónico válido",
      });
    }

    if (!phone || typeof phone !== "string" || phone.trim().length < 6) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El teléfono es obligatorio",
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

    const normalizedRut = normalizeRut(rut);
    const normalizedEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();

    // 2. Verificar si el RUT ya existe (cuenta activa o perfil presencial sin contraseña)
    const [existingByRut] = await db
      .select()
      .from(users)
      .where(eq(users.rut, normalizedRut))
      .limit(1);

    if (existingByRut && existingByRut.passwordHash !== null) {
      return res.status(409).json({
        error: "Conflict",
        message: "Ya existe una cuenta registrada con este RUT",
      });
    }

    // 3. Verificar si el correo ya está ocupado por otro usuario
    const [existingByEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        existingByRut
          ? and(eq(users.email, normalizedEmail), ne(users.id, existingByRut.id))
          : eq(users.email, normalizedEmail)
      )
      .limit(1);

    if (existingByEmail) {
      return res.status(409).json({
        error: "Conflict",
        message: "Ya existe una cuenta registrada con este correo electrónico",
      });
    }

    // 4. Hashear contraseña
    const passwordHash = await hashPassword(password);

    let registeredUser: {
      id: string;
      rut: string;
      name: string;
      email: string | null;
      role: UserRole;
      phone: string;
      createdAt: Date;
    };
    let claimed = false;

    if (existingByRut) {
      // Reclamo de perfil creado presencialmente (sin contraseña): se completa el mismo registro
      // y queda pendiente de confirmar el correo antes de permitir iniciar sesión y ver el historial.
      const [updated] = await db
        .update(users)
        .set({
          name: name.trim(),
          email: normalizedEmail,
          phone: cleanPhone,
          passwordHash,
          emailVerifiedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, existingByRut.id), isNull(users.passwordHash)))
        .returning({
          id: users.id,
          rut: users.rut,
          name: users.name,
          email: users.email,
          role: users.role,
          phone: users.phone,
          createdAt: users.createdAt,
        });

      if (!updated) {
        return res.status(409).json({
          error: "Conflict",
          message: "Ya existe una cuenta registrada con este RUT",
        });
      }
      registeredUser = updated;
      claimed = true;
    } else {
      const [created] = await db
        .insert(users)
        .values({
          rut: normalizedRut,
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: "usuario",
          phone: cleanPhone,
        })
        .returning({
          id: users.id,
          rut: users.rut,
          name: users.name,
          email: users.email,
          role: users.role,
          phone: users.phone,
          createdAt: users.createdAt,
        });
      registeredUser = created;
    }

    logAudit({
      userId: registeredUser.id,
      userEmail: registeredUser.email,
      action: "USER_REGISTER",
      entityType: "user",
      entityId: registeredUser.id,
      details: { rut: registeredUser.rut, claimed },
      req,
    });

    // 5. La cuenta queda pendiente: no hay sesión hasta que confirme el enlace que se le envía.
    await issueEmailVerification(registeredUser.id, normalizedEmail, registeredUser.name);

    return res.status(201).json({
      message: "Cuenta creada. Te enviamos un correo para confirmar tu dirección: ábrelo y sigue el enlace para activarla.",
      verificationRequired: true,
      claimed,
      user: registeredUser,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const text = String((error as any)?.detail || (error as any)?.constraint_name || (error as any)?.message || "");
      const isRutConflict = text.toLowerCase().includes("rut");
      return res.status(409).json({
        error: "Conflict",
        message: isRutConflict
          ? "Ya existe una cuenta registrada con este RUT"
          : "Ya existe una cuenta registrada con este correo electrónico",
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

    // 1. Buscar usuario y verificar la contraseña SIEMPRE (con hash ficticio si no existe o si es perfil sin cuenta):
    // misma respuesta y mismo tiempo para "no existe", "sin contraseña" y "clave incorrecta".
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    const passwordMatch = await verifyPassword(password, user?.passwordHash);

    if (!user || !user.passwordHash || !passwordMatch) {
      logAudit({
        userId: user?.id,
        userEmail: normalizedEmail,
        action: "LOGIN_FAILED",
        entityType: "user",
        entityId: user?.id,
        details: { reason: user ? (user.passwordHash ? "bad_password" : "no_password_profile") : "unknown_user" },
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

    // 3. Correo sin confirmar: solo se informa a quien demostró conocer la contraseña.
    if (!user.emailVerifiedAt) {
      logAudit({ userId: user.id, userEmail: user.email, action: "LOGIN_BLOCKED", entityType: "user", entityId: user.id, details: { reason: "email_not_verified" }, req });
      return res.status(403).json({
        error: "EmailNotVerified",
        message: "Aún no confirmas tu correo. Revisa tu bandeja de entrada y sigue el enlace que te enviamos.",
      });
    }

    // 4. Generar token y cookie
    const token = generateToken({
      userId: user.id,
      email: user.email ?? "",
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
        rut: user.rut,
        name: user.name,
        email: user.email,
        role: user.role,
        roles: rolesOf(user),
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
        rut: users.rut,
        name: users.name,
        email: users.email,
        role: users.role,
        extraRoles: users.extraRoles,
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

    return res.status(200).json({ user: withRoles(user) });
  } catch (error) {
    console.error("Error en getMe:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al obtener perfil",
    });
  }
}

/**
 * POST /api/auth/logout
 * Cierra solo esta sesión: borra la cookie y revoca el token en el servidor (otras sesiones siguen activas).
 */
export async function logout(req: Request, res: Response) {
  try {
    const token: string | undefined = req.cookies?.gc_token ?? (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : undefined);
    const payload = token ? verifyToken(token) : null;
    if (payload?.jti && payload.exp) {
      await db
        .insert(revokedTokens)
        .values({ jti: payload.jti, expiresAt: new Date(payload.exp * 1000) })
        .onConflictDoNothing();
    }
  } catch (error) {
    // Si la base falla, igual se borra la cookie del navegador.
    console.error("Error al revocar el token en logout:", error);
  }

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
        message: "role debe ser uno de: usuario, mecanico, vendedor, admin",
      });
    }

    const email = DEMO_ACCOUNTS[role];
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // Solo cuentas del dominio reservado de demo y con el rol esperado (nunca cuentas reales).
    if (!user || !user.isActive || !user.email || !isDemoEmail(user.email) || user.role !== role) {
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
      user: { id: user.id, rut: user.rut, name: user.name, email: user.email, role: user.role, roles: rolesOf(user), phone: user.phone },
    });
  } catch (error) {
    console.error("Error en demoLogin:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al iniciar la sesión demo" });
  }
}

/**
 * PATCH /api/auth/me { name?, phone? }
 * Edita el perfil propio. El correo, el RUT y el rol no se cambian desde aquí.
 */
export async function updateProfile(req: Request, res: Response) {
  try {
    const { name, phone } = req.body ?? {};
    if (name === undefined && phone === undefined) {
      return res.status(400).json({ error: "Bad Request", message: "Indica al menos un campo a modificar (name, phone)" });
    }
    if (name !== undefined && (typeof name !== "string" || name.trim().length < 2)) {
      return res.status(400).json({ error: "Bad Request", message: "El nombre debe tener al menos 2 caracteres" });
    }
    if (phone !== undefined && (typeof phone !== "string" || phone.trim().length < 6)) {
      return res.status(400).json({ error: "Bad Request", message: "El teléfono es obligatorio y debe ser válido" });
    }
    const tooLong = findTooLong([
      ["El nombre", name, MAX_LEN.name],
      ["El teléfono", phone, MAX_LEN.phone],
    ]);
    if (tooLong) {
      return res.status(400).json({ error: "Bad Request", message: tooLong });
    }

    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (typeof name === "string") updates.name = name.trim();
    if (typeof phone === "string") updates.phone = phone.trim();

    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.user!.userId))
      .returning({
        id: users.id,
        rut: users.rut,
        name: users.name,
        email: users.email,
        role: users.role,
        extraRoles: users.extraRoles,
        phone: users.phone,
        isActive: users.isActive,
        createdAt: users.createdAt,
      });

    logAudit({ action: "PROFILE_UPDATED", entityType: "user", entityId: req.user!.userId, details: { fields: Object.keys(updates).filter((k) => k !== "updatedAt") }, req });
    return res.status(200).json({ message: "Perfil actualizado exitosamente", user: withRoles(user) });
  } catch (error) {
    console.error("Error en updateProfile:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al actualizar el perfil" });
  }
}

const RESET_TOKEN_MINUTES = 60;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * POST /api/auth/forgot-password { email }
 * Siempre responde igual (exista o no la cuenta) para no revelar qué correos están registrados.
 * Si la cuenta existe y está activa, envía un enlace de un solo uso válido por 60 minutos.
 */
export async function forgotPassword(req: Request, res: Response) {
  const generic = {
    message: "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada.",
  };
  try {
    const email = req.body?.email;
    if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim()) || email.length > MAX_LEN.email) {
      return res.status(400).json({ error: "Bad Request", message: "Debe ingresar un correo electrónico válido" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (user && user.isActive && user.email) {
      const token = randomBytes(32).toString("base64url");
      await db.transaction(async (tx) => {
        // un solo enlace vigente por cuenta: los anteriores dejan de servir
        await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
        await tx.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000),
        });
      });
      const resetUrl = `${config.appUrl}/restablecer?token=${encodeURIComponent(token)}`;
      sendPasswordResetEmail(user.email, user.name, resetUrl, RESET_TOKEN_MINUTES);
      logAudit({ userId: user.id, userEmail: user.email, action: "PASSWORD_RESET_REQUESTED", entityType: "user", entityId: user.id, req });
    } else {
      logAudit({ userEmail: normalizedEmail, action: "PASSWORD_RESET_REQUESTED", entityType: "user", details: { known: Boolean(user), reason: user ? "inactive" : "unknown_user" }, req });
    }

    return res.status(200).json(generic);
  } catch (error) {
    console.error("Error en forgotPassword:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "No se pudo procesar la solicitud" });
  }
}

/**
 * POST /api/auth/reset-password { token, password }
 * Cambia la contraseña con un enlace vigente de un solo uso y cierra todas las sesiones de la cuenta.
 */
export async function resetPassword(req: Request, res: Response) {
  try {
    const { token, password } = req.body ?? {};
    if (typeof token !== "string" || token.length < 20 || token.length > 200) {
      return res.status(400).json({ error: "Bad Request", message: "El enlace no es válido o ya venció. Solicita uno nuevo." });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: "Bad Request", message: passwordError });
    }

    const passwordHash = await hashPassword(password);
    const tokenHash = hashToken(token);

    const result = await db.transaction(async (tx) => {
      // "Consumir" el token de forma atómica: solo una solicitud puede usarlo.
      const [consumed] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
        .returning({ userId: passwordResetTokens.userId });
      if (!consumed) return null;

      const [user] = await tx
        .update(users)
        .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` as unknown as Date, tokenVersion: sql`${users.tokenVersion} + 1` as unknown as number, updatedAt: new Date() })
        .where(and(eq(users.id, consumed.userId), eq(users.isActive, true)))
        .returning({ id: users.id, email: users.email });
      if (!user) return null;

      // cualquier otro enlace pendiente de la cuenta deja de servir
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt), ne(passwordResetTokens.tokenHash, tokenHash)));
      return user;
    });

    if (!result) {
      return res.status(400).json({ error: "Bad Request", message: "El enlace no es válido o ya venció. Solicita uno nuevo." });
    }

    logAudit({ userId: result.id, userEmail: result.email, action: "PASSWORD_RESET_COMPLETED", entityType: "user", entityId: result.id, req });
    return res.status(200).json({ message: "Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña." });
  } catch (error) {
    console.error("Error en resetPassword:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "No se pudo restablecer la contraseña" });
  }
}

/**
 * POST /api/auth/verify-email { token }
 * Confirma el correo con un enlace vigente de un solo uso y activa la cuenta.
 */
export async function verifyEmail(req: Request, res: Response) {
  const invalid = { error: "Bad Request", message: "El enlace no es válido o ya venció. Pide uno nuevo desde el inicio de sesión." };
  try {
    const { token } = req.body ?? {};
    if (typeof token !== "string" || token.length < 20 || token.length > 200) return res.status(400).json(invalid);

    const tokenHash = hashVerifyToken(token);
    const user = await db.transaction(async (tx) => {
      const [consumed] = await tx
        .update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(emailVerificationTokens.tokenHash, tokenHash), isNull(emailVerificationTokens.usedAt), gt(emailVerificationTokens.expiresAt, new Date())))
        .returning({ userId: emailVerificationTokens.userId });
      if (!consumed) return null;

      const [verified] = await tx
        .update(users)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, consumed.userId))
        .returning({ id: users.id, email: users.email, name: users.name });
      if (!verified || !verified.email) return null;

      return verified;
    });

    if (!user || !user.email) return res.status(400).json(invalid);

    logAudit({ userId: user.id, userEmail: user.email, action: "EMAIL_VERIFIED", entityType: "user", entityId: user.id, req });
    sendWelcomeEmail(user.email, user.name);
    return res.status(200).json({ message: "¡Correo confirmado! Tu cuenta está activa: ya puedes iniciar sesión." });
  } catch (error) {
    console.error("Error en verifyEmail:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "No se pudo confirmar el correo" });
  }
}

/**
 * POST /api/auth/resend-verification { email }
 * Siempre responde igual (exista o no la cuenta). Si está pendiente de confirmar, envía un enlace nuevo.
 */
export async function resendVerification(req: Request, res: Response) {
  const generic = { message: "Si ese correo tiene una cuenta pendiente de confirmar, te enviamos un enlace nuevo. Revisa tu bandeja de entrada." };
  try {
    const email = req.body?.email;
    if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim()) || email.length > MAX_LEN.email) {
      return res.status(400).json({ error: "Bad Request", message: "Debe ingresar un correo electrónico válido" });
    }
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    if (user && user.isActive && !user.emailVerifiedAt && user.email && user.passwordHash) {
      await issueEmailVerification(user.id, user.email, user.name);
      logAudit({ userId: user.id, userEmail: user.email, action: "EMAIL_VERIFICATION_RESENT", entityType: "user", entityId: user.id, req });
    }
    return res.status(200).json(generic);
  } catch (error) {
    console.error("Error en resendVerification:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "No se pudo procesar la solicitud" });
  }
}
