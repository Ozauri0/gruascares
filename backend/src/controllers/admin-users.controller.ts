import { Request, Response } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { logAudit } from "../services/audit/audit.service.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { parsePagination } from "../utils/pagination.js";
import { hashPassword, validatePassword } from "../utils/password.js";
import { rolesOf, withRoles } from "../utils/roles.js";
import { EMAIL_REGEX, MAX_LEN, findTooLong, isUuid } from "../utils/validate.js";

const ROLES = ["admin", "mecanico", "usuario", "vendedor"] as const;
type Role = (typeof ROLES)[number];
const STAFF_ROLES = ["mecanico", "vendedor", "admin"] as const;

/** Valida una lista de roles: sin repetidos y sin mezclar "usuario" (cliente) con roles de personal. */
function parseRoles(value: unknown, allowed: readonly Role[]): Role[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0) return { error: "roles debe ser una lista con al menos un rol" };
  const list = [...new Set(value)];
  if (!list.every((r): r is Role => typeof r === "string" && (allowed as readonly string[]).includes(r))) {
    return { error: `roles solo admite [${allowed.join(", ")}]` };
  }
  if (list.length > 1 && list.includes("usuario")) return { error: "El rol cliente no se combina con roles de personal" };
  return list;
}

const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);

/** Campos públicos de un usuario (nunca el hash de contraseña ni la versión de sesión). */
const publicUser = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  extraRoles: users.extraRoles,
  phone: users.phone,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

/** Escapa % _ \ para usarlos como texto literal dentro de un ILIKE. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * GET /api/admin/users?q=&role=&active=&page=&limit=
 * Directorio de usuarios con búsqueda por nombre/correo, filtro por rol y estado, y paginación.
 */
export async function listUsers(req: Request, res: Response) {
  try {
    const { q, role, active } = req.query;
    const conditions = [];

    if (role !== undefined) {
      if (!isRole(role)) {
        return res.status(400).json({ error: "Bad Request", message: `role debe ser uno de [${ROLES.join(", ")}]` });
      }
      conditions.push(or(eq(users.role, role), sql`${role}::user_role = ANY(${users.extraRoles})`));
    }
    if (active !== undefined) {
      if (active !== "true" && active !== "false") {
        return res.status(400).json({ error: "Bad Request", message: "active debe ser 'true' o 'false'" });
      }
      conditions.push(eq(users.isActive, active === "true"));
    }
    if (typeof q === "string" && q.trim()) {
      const pattern = `%${escapeLike(q.trim().slice(0, 100))}%`;
      conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern)));
    }

    const { page, limit, offset } = parsePagination(req.query, { limit: 50, maxLimit: 200 });
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(users).where(where);
    const list = await db.select(publicUser).from(users).where(where).orderBy(desc(users.createdAt), desc(users.id)).limit(limit).offset(offset);

    return res.json({ total, page, limit, users: list.map(withRoles) });
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al consultar los usuarios" });
  }
}

/**
 * POST /api/admin/users
 * Alta de personal (mecánico o administrador) con contraseña inicial.
 */
export async function createStaffUser(req: Request, res: Response) {
  try {
    const { name, email, password, phone, role, roles } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ error: "Bad Request", message: "El nombre es obligatorio (mínimo 2 caracteres)" });
    }
    if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: "Bad Request", message: "Debe ingresar un correo electrónico válido" });
    }
    // Un solo `role` o una lista `roles`: el primero es el principal (su página de inicio).
    const parsedRoles = parseRoles(roles ?? [role], STAFF_ROLES);
    if ("error" in parsedRoles) {
      return res.status(400).json({ error: "Bad Request", message: `role debe ser uno de [${STAFF_ROLES.join(", ")}]` });
    }
    const [primaryRole, ...extraRoles] = parsedRoles;
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
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing) {
      return res.status(409).json({ error: "Conflict", message: "Ya existe una cuenta registrada con este correo electrónico" });
    }

    const [created] = await db
      .insert(users)
      .values({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
        role: primaryRole,
        extraRoles,
        phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
      })
      .returning(publicUser);

    logAudit({
      action: "USER_CREATED",
      entityType: "user",
      entityId: created.id,
      details: { email: created.email, role: created.role, roles: rolesOf(created) },
      req,
    });

    return res.status(201).json({ message: "Cuenta creada exitosamente", user: withRoles(created) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Conflict", message: "Ya existe una cuenta registrada con este correo electrónico" });
    }
    console.error("Error al crear usuario:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al crear la cuenta" });
  }
}

/**
 * PATCH /api/admin/users/:id { role?, isActive?, name?, phone? }
 * Cambia rol, estado o datos. Cambiar rol o desactivar invalida las sesiones del usuario.
 * El administrador no puede quitarse su propio acceso ni dejar al sistema sin administradores activos.
 */
export async function updateUser(req: Request, res: Response) {
  try {
    const currentUser = req.user!;
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ error: "Bad Request", message: "ID de usuario inválido: debe ser un UUID" });
    }

    const { role, roles, isActive, name, phone } = req.body ?? {};
    if (role === undefined && roles === undefined && isActive === undefined && name === undefined && phone === undefined) {
      return res.status(400).json({ error: "Bad Request", message: "Indica al menos un campo a modificar (role, roles, isActive, name, phone)" });
    }
    if (role !== undefined && !isRole(role)) {
      return res.status(400).json({ error: "Bad Request", message: `role debe ser uno de [${ROLES.join(", ")}]` });
    }
    const parsedRoles = roles === undefined ? undefined : parseRoles(roles, ROLES);
    if (parsedRoles && "error" in parsedRoles) {
      return res.status(400).json({ error: "Bad Request", message: parsedRoles.error });
    }
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return res.status(400).json({ error: "Bad Request", message: "isActive debe ser true o false" });
    }
    if (name !== undefined && (typeof name !== "string" || name.trim().length < 2)) {
      return res.status(400).json({ error: "Bad Request", message: "El nombre debe tener al menos 2 caracteres" });
    }
    if (phone !== undefined && phone !== null && typeof phone !== "string") {
      return res.status(400).json({ error: "Bad Request", message: "El teléfono debe ser texto" });
    }
    const tooLong = findTooLong([
      ["El nombre", name, MAX_LEN.name],
      ["El teléfono", phone, MAX_LEN.phone],
    ]);
    if (tooLong) {
      return res.status(400).json({ error: "Bad Request", message: tooLong });
    }

    // Transacción con candado: dos administradores que se degraden a la vez no pueden dejar el sistema sin admins.
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('admin-roster'))`);

      const [target] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
      if (!target) return { kind: "not_found" as const };

      // Roles resultantes: `roles` (lista completa) o `role` (principal; conserva los adicionales que sigan valiendo).
      const before = rolesOf(target);
      let newPrimary = target.role;
      let newExtra = target.extraRoles;
      if (parsedRoles) {
        newPrimary = parsedRoles[0]; // el orden importa: el primero es el rol principal (su página de inicio)
        newExtra = parsedRoles.filter((r) => r !== newPrimary);
      } else if (role !== undefined) {
        newPrimary = role;
        newExtra = role === "usuario" ? [] : target.extraRoles.filter((r) => r !== role);
      }
      const after = rolesOf({ role: newPrimary, extraRoles: newExtra });
      const roleChanges = newPrimary !== target.role || before.length !== after.length || !before.every((r) => after.includes(r));
      const willBeAdmin = after.includes("admin");
      const activeChanges = isActive !== undefined && isActive !== target.isActive;

      if (id === currentUser.userId && ((roleChanges && !willBeAdmin) || (activeChanges && isActive === false))) {
        return {
          kind: "conflict" as const,
          message: "No puedes quitarte tu propio acceso de administrador ni desactivar tu propia cuenta",
        };
      }

      const losesAdmin = before.includes("admin") && target.isActive && ((roleChanges && !willBeAdmin) || (activeChanges && isActive === false));
      if (losesAdmin) {
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(users)
          .where(and(or(eq(users.role, "admin"), sql`'admin' = ANY(${users.extraRoles})`), eq(users.isActive, true)));
        if (n <= 1) return { kind: "conflict" as const, message: "Debe quedar al menos un administrador activo" };
      }

      const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (roleChanges) {
        updates.role = newPrimary;
        updates.extraRoles = newExtra;
      }
      if (isActive !== undefined) updates.isActive = isActive;
      if (typeof name === "string") updates.name = name.trim();
      if (phone !== undefined) updates.phone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
      // Dar de baja cierra sus sesiones; cambiar roles no: los permisos se leen de la base en cada petición.
      if (activeChanges) updates.tokenVersion = sql`${users.tokenVersion} + 1` as unknown as number;

      const [updated] = await tx.update(users).set(updates).where(eq(users.id, id)).returning(publicUser);
      return { kind: "ok" as const, target, updated, roleChanges, activeChanges };
    });

    if (result.kind === "not_found") {
      return res.status(404).json({ error: "Not Found", message: "El usuario solicitado no existe" });
    }
    if (result.kind === "conflict") {
      return res.status(409).json({ error: "Conflict", message: result.message });
    }
    const { target, updated, roleChanges, activeChanges } = result;

    logAudit({
      action: roleChanges ? "USER_ROLE_CHANGED" : activeChanges ? (isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED") : "USER_UPDATED",
      entityType: "user",
      entityId: id,
      details: { previousRole: target.role, newRole: updated.role, previousRoles: rolesOf(target), newRoles: rolesOf(updated), previousActive: target.isActive, newActive: updated.isActive },
      req,
    });

    return res.json({ message: "Usuario actualizado exitosamente", user: withRoles(updated) });
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al actualizar el usuario" });
  }
}

/**
 * GET /api/mechanic/list
 * Personal de taller activo (mecánicos y administradores) para los selectores de asignación.
 */
export async function listWorkshopStaff(_req: Request, res: Response) {
  try {
    const staff = await db
      .select({ id: users.id, name: users.name, role: users.role, extraRoles: users.extraRoles })
      .from(users)
      .where(and(eq(users.isActive, true), or(eq(users.role, "mecanico"), eq(users.role, "admin"), sql`${users.extraRoles} && ARRAY['mecanico', 'admin']::user_role[]`)))
      .orderBy(users.name);
    return res.json({ staff: staff.map(withRoles) });
  } catch (error) {
    console.error("Error al listar personal de taller:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al consultar el personal de taller" });
  }
}
