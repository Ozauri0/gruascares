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

// 1. Agenda diaria/semanal del taller (mecánicos y administradores)
router.get("/agenda", authorizeRoles("mecanico", "admin"), getMechanicAgenda);

// 2. Transición de estado de cita desde la vista de taller
router.patch("/appointments/:id/status", authorizeRoles("mecanico", "admin"), updateAppointmentStatus);

// 3. Registrar o actualizar hoja de atención técnica
router.post("/appointments/:id/report", authorizeRoles("mecanico", "admin"), saveTechnicalReport);

// 4. Consultar hoja técnica de una cita
router.get("/appointments/:id/report", getAppointmentReport);

export default router;
