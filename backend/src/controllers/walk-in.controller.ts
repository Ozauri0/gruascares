import { Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users, vehicles } from "../db/schema.js";
import { isValidRut, normalizeRut } from "../utils/rut.js";
import { MAX_LEN, findTooLong, isValidEmail } from "../utils/validate.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { logAudit } from "../services/audit/audit.service.js";

/**
 * GET /api/clients/by-rut?rut=... (o /api/clients/by-rut/:rut)
 * Busca un cliente por RUT y devuelve sus datos y vehículos.
 * Accesible para ventas (vendedor), taller (mecanico), grúas (grua) y administración (admin).
 */
export async function getClientByRut(req: Request, res: Response) {
  try {
    const rawRut = (req.query.rut as string | undefined) ?? (req.params.rut as string | undefined);
    if (!rawRut || typeof rawRut !== "string" || !isValidRut(rawRut)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El RUT no es válido. Ingresa un RUT chileno con dígito verificador correcto",
      });
    }

    const cleanRut = normalizeRut(rawRut);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.rut, cleanRut))
      .limit(1);

    if (!user) {
      return res.status(404).json({
        error: "Not Found",
        message: `No existe ningún cliente registrado con el RUT ${cleanRut}`,
      });
    }

    const clientVehicles = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.userId, user.id))
      .orderBy(desc(vehicles.createdAt));

    return res.json({
      client: {
        id: user.id,
        rut: user.rut,
        name: user.name,
        phone: user.phone,
        email: user.email,
        hasAccount: Boolean(user.passwordHash),
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      vehicles: clientVehicles,
    });
  } catch (error) {
    console.error("Error al buscar cliente por RUT:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al buscar el cliente por RUT",
    });
  }
}

/**
 * POST /api/clients
 * Registro presencial de cliente sin cuenta web (sin contraseña y correo opcional).
 * Solo permitido para ventas (vendedor) y administración (admin).
 */
export async function createWalkInClient(req: Request, res: Response) {
  try {
    const { name, rut, phone, email } = req.body ?? {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Bad Request", message: "El nombre es obligatorio" });
    }
    if (!rut || typeof rut !== "string" || !isValidRut(rut)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El RUT es obligatorio y debe tener un dígito verificador válido",
      });
    }
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El teléfono es obligatorio para poder comunicarse con el cliente",
      });
    }

    const cleanEmail =
      email === undefined || email === null || (typeof email === "string" && !email.trim())
        ? null
        : typeof email === "string"
        ? email.trim().toLowerCase()
        : null;

    if (email !== undefined && email !== null && email !== "" && (!cleanEmail || !isValidEmail(cleanEmail))) {
      return res.status(400).json({ error: "Bad Request", message: "El formato del correo electrónico no es válido" });
    }

    const tooLong = findTooLong([
      ["El nombre", name, MAX_LEN.name],
      ["El correo", cleanEmail, MAX_LEN.email],
      ["El teléfono", phone, MAX_LEN.phone],
    ]);
    if (tooLong) {
      return res.status(400).json({ error: "Bad Request", message: tooLong });
    }

    const cleanRut = normalizeRut(rut);

    const [existingByRut] = await db
      .select()
      .from(users)
      .where(eq(users.rut, cleanRut))
      .limit(1);

    if (existingByRut) {
      return res.status(409).json({
        error: "Conflict",
        message: "Ya existe un perfil registrado con ese RUT",
        client: {
          id: existingByRut.id,
          rut: existingByRut.rut,
          name: existingByRut.name,
          phone: existingByRut.phone,
          email: existingByRut.email,
          hasAccount: Boolean(existingByRut.passwordHash),
        },
      });
    }

    if (cleanEmail) {
      const [existingByEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, cleanEmail))
        .limit(1);
      if (existingByEmail) {
        return res.status(409).json({
          error: "Conflict",
          message: "Ya existe un usuario registrado con ese correo electrónico",
        });
      }
    }

    const [created] = await db
      .insert(users)
      .values({
        name: name.trim(),
        rut: cleanRut,
        phone: phone.trim(),
        email: cleanEmail,
        passwordHash: null,
        role: "usuario",
        isActive: true,
        emailVerifiedAt: null,
      })
      .returning();

    logAudit({
      action: "WALK_IN_CLIENT_CREATED",
      entityType: "user",
      entityId: created.id,
      details: { rut: created.rut, name: created.name, phone: created.phone, email: created.email },
      req,
    });

    return res.status(201).json({
      message: "Cliente registrado presencialmente",
      client: {
        id: created.id,
        rut: created.rut,
        name: created.name,
        phone: created.phone,
        email: created.email,
        hasAccount: false,
        isActive: created.isActive,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({
        error: "Conflict",
        message: "Ya existe un perfil con ese RUT o correo electrónico",
      });
    }
    console.error("Error al crear cliente presencial:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al registrar el cliente",
    });
  }
}
