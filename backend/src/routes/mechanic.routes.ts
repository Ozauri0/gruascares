import { assignAppointmentWorker } from "../controllers/admin.controller.js";
import { Router } from "express";
import {
  getMechanicAgenda,
  updateAppointmentStatus,
  saveTechnicalReport,
  getAppointmentReport,
} from "../controllers/mechanic.controller.js";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// Todas las rutas de mecánicos requieren autenticación
router.use(authenticate);

// 1. Agenda del área (?area=serviteca | grua): jefes de taller, jefes de grúas y administradores
router.get("/agenda", authorizeRoles("mecanico", "grua", "admin"), getMechanicAgenda);

// 2. Transición de estado de cita desde la vista de taller
router.patch("/appointments/:id/status", authorizeRoles("mecanico", "grua", "admin"), updateAppointmentStatus);

// 2b. Asignar o cambiar el trabajador a cargo (jefe del área o admin; solo citas que siguen activas)
router.patch("/appointments/:id/assign", authorizeRoles("mecanico", "grua", "admin"), assignAppointmentWorker);

// 3. Registrar o actualizar hoja de atención técnica
router.post("/appointments/:id/report", authorizeRoles("mecanico", "grua", "admin"), saveTechnicalReport);

// 4. Consultar hoja técnica de una cita
router.get("/appointments/:id/report", getAppointmentReport);

export default router;
