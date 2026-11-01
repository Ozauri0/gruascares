import { Router } from "express";
import {
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from "../controllers/vehicle.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

// Todas las rutas de vehículos están protegidas mediante autenticación
router.use(authenticate);

// 1. Listar vehículos del usuario (o todos/filtrados para admin/mecánico)
router.get("/", getVehicles);

// 2. Registrar un nuevo vehículo
router.post("/", createVehicle);

// 3. Obtener detalle de un vehículo por ID
router.get("/:id", getVehicleById);

// 4. Actualizar vehículo existente (soporta PUT y PATCH)
router.put("/:id", updateVehicle);
router.patch("/:id", updateVehicle);

// 5. Eliminar vehículo
router.delete("/:id", deleteVehicle);

export default router;
