import { reassignAppointmentMechanic } from "../controllers/admin.controller.js";
import { Router } from "express";
import {
  getMechanicAgenda,
  updateAppointmentStatus,
  saveTechnicalReport,
  getAppointmentReport,
} from "../controllers/mechanic.controller.js";
import { listWorkshopStaff } from "../controllers/admin-users.controller.js";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// Todas las rutas de mecánicos requieren autenticación
router.use(authenticate);

// 0. Personal de taller activo (selector de asignación)
router.get("/list", authorizeRoles("mecanico", "admin"), listWorkshopStaff);

// 1. Agenda diaria/semanal del taller (mecánicos y administradores)
router.get("/agenda", authorizeRoles("mecanico", "admin"), getMechanicAgenda);

// 2. Transición de estado de cita desde la vista de taller
router.patch("/appointments/:id/status", authorizeRoles("mecanico", "admin"), updateAppointmentStatus);

// 2b. Cambiar el mecánico a cargo (mecánicos y administradores; solo citas que siguen activas)
router.patch("/appointments/:id/assign", authorizeRoles("mecanico", "admin"), reassignAppointmentMechanic);

// 3. Registrar o actualizar hoja de atención técnica
router.post("/appointments/:id/report", authorizeRoles("mecanico", "admin"), saveTechnicalReport);

// 4. Consultar hoja técnica de una cita
router.get("/appointments/:id/report", getAppointmentReport);

export default router;
