import { Request, Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { vehicles, users } from "../db/schema.js";
import { isValidChileanPlate, normalizePlate } from "../utils/plate.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/vehicles
 * Lista vehículos accesibles según el rol:
 * - Para usuario regular: retorna únicamente sus vehículos registrados.
 * - Para mecánico / admin: permite filtrar por ?userId=<uuid> o ?plate=<patente>, o listar todos.
 */
export async function getVehicles(req: Request, res: Response) {
  try {
    const currentUser = req.user;
    if (!currentUser) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No autenticado",
      });
    }

    const { userId: filterUserId, plate: filterPlate } = req.query;

    // Si es usuario estándar, solo puede consultar sus propios vehículos
    if (currentUser.role === "usuario") {
      const userVehicles = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.userId, currentUser.userId))
        .orderBy(desc(vehicles.createdAt));

      return res.json({
        count: userVehicles.length,
        vehicles: userVehicles,
      });
    }

    // Para administradores o mecánicos:
    const conditions = [];

    if (filterUserId && typeof filterUserId === "string") {
      if (!UUID_REGEX.test(filterUserId)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "El parámetro userId debe ser un UUID válido",
        });
      }
      conditions.push(eq(vehicles.userId, filterUserId));
    }

    if (filterPlate && typeof filterPlate === "string") {
      const cleanPlate = normalizePlate(filterPlate);
      if (cleanPlate) {
        conditions.push(eq(vehicles.plate, cleanPlate));
      }
    }

    const allVehicles = await db
      .select({
        id: vehicles.id,
        userId: vehicles.userId,
        userName: users.name,
        userEmail: users.email,
        userPhone: users.phone,
        plate: vehicles.plate,
        brand: vehicles.brand,
        model: vehicles.model,
        year: vehicles.year,
        mileage: vehicles.mileage,
        notes: vehicles.notes,
        createdAt: vehicles.createdAt,
        updatedAt: vehicles.updatedAt,
      })
      .from(vehicles)
      .leftJoin(users, eq(vehicles.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(vehicles.createdAt));

    return res.json({
      count: allVehicles.length,
      vehicles: allVehicles,
    });
  } catch (error) {
    console.error("Error al obtener vehículos:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al consultar los vehículos",
    });
  }
}

/**
 * GET /api/vehicles/:id
 * Obtiene los detalles de un vehículo específico por ID.
 */
export async function getVehicleById(req: Request, res: Response) {
  try {
    const currentUser = req.user;
    if (!currentUser) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No autenticado",
      });
    }

    const { id } = req.params;
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "ID de vehículo inválido: debe ser un UUID",
      });
    }

    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, id))
      .limit(1);

    if (!vehicle) {
      return res.status(404).json({
        error: "Not Found",
        message: "El vehículo solicitado no existe",
      });
    }

    // Verificar permisos: el dueño o personal técnico/admin
    if (currentUser.role === "usuario" && vehicle.userId !== currentUser.userId) {
      return res.status(403).json({
        error: "Forbidden",
        message: "No tienes permiso para ver este vehículo",
      });
    }

    return res.json({ vehicle });
  } catch (error) {
    console.error("Error al obtener detalle del vehículo:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al consultar el vehículo",
    });
  }
}

/**
 * POST /api/vehicles
 * Registra un nuevo vehículo para el usuario autenticado.
 */
export async function createVehicle(req: Request, res: Response) {
  try {
    const currentUser = req.user;
    if (!currentUser) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No autenticado",
      });
    }

    const { plate, brand, model, year, mileage, notes, userId: targetUserId } = req.body;

    // Si es admin y envía userId, puede registrar vehículos a nombre de un cliente
    let ownerUserId = currentUser.userId;
    if (targetUserId && (currentUser.role === "admin" || currentUser.role === "mecanico")) {
      if (!UUID_REGEX.test(targetUserId)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "El targetUserId debe ser un UUID válido",
        });
      }
      ownerUserId = targetUserId;
    }

    // 1. Validar y normalizar patente
    if (!plate || typeof plate !== "string") {
      return res.status(400).json({
        error: "Bad Request",
        message: "La patente es obligatoria",
      });
    }

    const normalized = normalizePlate(plate);
    if (!isValidChileanPlate(normalized)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Formato de patente chilena inválido. Debe corresponder a 2 letras y 4 números (ej. AB1234) o 4 letras y 2 números (ej. ABCD12)",
      });
    }

    // 2. Validar marca y modelo
    if (!brand || typeof brand !== "string" || brand.trim().length === 0) {
      return res.status(400).json({
        error: "Bad Request",
        message: "La marca del vehículo es obligatoria",
      });
    }

    if (!model || typeof model !== "string" || model.trim().length === 0) {
      return res.status(400).json({
        error: "Bad Request",
        message: "El modelo del vehículo es obligatorio",
      });
    }

    // 3. Validar año si se proporciona
    let parsedYear: number | null = null;
    if (year !== undefined && year !== null && year !== "") {
      parsedYear = Number(year);
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(parsedYear) || parsedYear < 1920 || parsedYear > currentYear + 1) {
        return res.status(400).json({
          error: "Bad Request",
          message: `El año debe ser un número entero válido entre 1920 y ${currentYear + 1}`,
        });
      }
    }

    // 4. Validar kilometraje si se proporciona
    let parsedMileage = 0;
    if (mileage !== undefined && mileage !== null && mileage !== "") {
      parsedMileage = Number(mileage);
      if (!Number.isInteger(parsedMileage) || parsedMileage < 0) {
        return res.status(400).json({
          error: "Bad Request",
          message: "El kilometraje debe ser un número entero mayor o igual a 0",
        });
      }
    }

    // 5. Verificar si este usuario ya tiene registrada esta patente
    const existing = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.userId, ownerUserId), eq(vehicles.plate, normalized)))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({
        error: "Conflict",
        message: `El vehículo con patente ${normalized} ya se encuentra registrado en tu cuenta`,
      });
    }

    // 6. Insertar en base de datos
    const [newVehicle] = await db
      .insert(vehicles)
      .values({
        userId: ownerUserId,
        plate: normalized,
        brand: brand.trim(),
        model: model.trim(),
        year: parsedYear,
        mileage: parsedMileage,
        notes: notes && typeof notes === "string" ? notes.trim() : null,
      })
      .returning();

    return res.status(201).json({
      message: "Vehículo registrado exitosamente",
      vehicle: newVehicle,
    });
  } catch (error) {
    console.error("Error al registrar vehículo:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al registrar el vehículo",
    });
  }
}

/**
 * PATCH /api/vehicles/:id
 * PUT /api/vehicles/:id
 * Actualiza los datos de un vehículo existente.
 */
export async function updateVehicle(req: Request, res: Response) {
  try {
    const currentUser = req.user;
    if (!currentUser) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No autenticado",
      });
    }

    const { id } = req.params;
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "ID de vehículo inválido: debe ser un UUID",
      });
    }

    // Buscar vehículo actual
    const [existing] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        error: "Not Found",
        message: "El vehículo solicitado no existe",
      });
    }

    // Verificar permisos
    if (currentUser.role === "usuario" && existing.userId !== currentUser.userId) {
      return res.status(403).json({
        error: "Forbidden",
        message: "No tienes permiso para modificar este vehículo",
      });
    }

    const { plate, brand, model, year, mileage, notes } = req.body;
    const updates: Partial<typeof vehicles.$inferInsert> = {
      updatedAt: new Date(),
    };

    // Validar patente si se actualiza
    if (plate !== undefined) {
      if (typeof plate !== "string") {
        return res.status(400).json({
          error: "Bad Request",
          message: "La patente debe ser texto",
        });
      }
      const normalized = normalizePlate(plate);
      if (!isValidChileanPlate(normalized)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Formato de patente chilena inválido",
        });
      }

      // Si cambió de patente, verificar que no colisione con otro vehículo del mismo usuario
      if (normalized !== existing.plate) {
        const duplicate = await db
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(and(eq(vehicles.userId, existing.userId), eq(vehicles.plate, normalized)))
          .limit(1);

        if (duplicate.length > 0) {
          return res.status(409).json({
            error: "Conflict",
            message: `Ya tienes otro vehículo registrado con la patente ${normalized}`,
          });
        }
      }
      updates.plate = normalized;
    }

    // Validar marca
    if (brand !== undefined) {
      if (typeof brand !== "string" || brand.trim().length === 0) {
        return res.status(400).json({
          error: "Bad Request",
          message: "La marca no puede estar vacía",
        });
      }
      updates.brand = brand.trim();
    }

    // Validar modelo
    if (model !== undefined) {
      if (typeof model !== "string" || model.trim().length === 0) {
        return res.status(400).json({
          error: "Bad Request",
          message: "El modelo no puede estar vacío",
        });
      }
      updates.model = model.trim();
    }

    // Validar año
    if (year !== undefined) {
      if (year === null || year === "") {
        updates.year = null;
      } else {
        const parsedYear = Number(year);
        const currentYear = new Date().getFullYear();
        if (!Number.isInteger(parsedYear) || parsedYear < 1920 || parsedYear > currentYear + 1) {
          return res.status(400).json({
            error: "Bad Request",
            message: `El año debe ser un número entero válido entre 1920 y ${currentYear + 1}`,
          });
        }
        updates.year = parsedYear;
      }
    }

    // Validar kilometraje
    if (mileage !== undefined) {
      if (mileage === null || mileage === "") {
        updates.mileage = 0;
      } else {
        const parsedMileage = Number(mileage);
        if (!Number.isInteger(parsedMileage) || parsedMileage < 0) {
          return res.status(400).json({
            error: "Bad Request",
            message: "El kilometraje debe ser un número entero mayor o igual a 0",
          });
        }
        updates.mileage = parsedMileage;
      }
    }

    // Notas
    if (notes !== undefined) {
      updates.notes = notes && typeof notes === "string" ? notes.trim() : null;
    }

    const [updatedVehicle] = await db
      .update(vehicles)
      .set(updates)
      .where(eq(vehicles.id, id))
      .returning();

    return res.json({
      message: "Vehículo actualizado exitosamente",
      vehicle: updatedVehicle,
    });
  } catch (error) {
    console.error("Error al actualizar vehículo:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al actualizar el vehículo",
    });
  }
}

/**
 * DELETE /api/vehicles/:id
 * Da de baja o elimina un vehículo del usuario.
 */
export async function deleteVehicle(req: Request, res: Response) {
  try {
    const currentUser = req.user;
    if (!currentUser) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No autenticado",
      });
    }

    const { id } = req.params;
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "ID de vehículo inválido: debe ser un UUID",
      });
    }

    // Verificar existencia del vehículo
    const [existing] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        error: "Not Found",
        message: "El vehículo solicitado no existe",
      });
    }

    // Verificar permisos
    if (currentUser.role === "usuario" && existing.userId !== currentUser.userId) {
      return res.status(403).json({
        error: "Forbidden",
        message: "No tienes permiso para eliminar este vehículo",
      });
    }

    // Eliminar el vehículo (las citas asociadas preservan su registro histórico con vehicleId en null)
    await db.delete(vehicles).where(eq(vehicles.id, id));

    return res.json({
      message: "Vehículo eliminado exitosamente",
      deletedId: id,
      plate: existing.plate,
    });
  } catch (error) {
    console.error("Error al eliminar vehículo:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Error al eliminar el vehículo",
    });
  }
}
