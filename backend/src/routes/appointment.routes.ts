import { Router } from "express";
import {
  getServicesCatalog,
  getAvailableSlots,
  createAppointment,
  getMyAppointments,
  getAppointmentById,
  cancelAppointment,
} from "../controllers/appointment.controller.js";
import {
  updateAppointmentStatus,
  saveTechnicalReport,
  getAppointmentReport,
} from "../controllers/mechanic.controller.js";
import { authenticate, optionalAuthenticate, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// 1. Catálogo de servicios disponibles
router.get("/services", getServicesCatalog);

// 2. Disponibilidad de horarios por fecha
router.get("/availability", getAvailableSlots);

// 3. Crear solicitud de cita (público o con sesión activa)
router.post("/", optionalAuthenticate, createAppointment);

// 4. Mis citas (usuario autenticado)
router.get("/my", authenticate, getMyAppointments);

// 5. Ver detalle de una cita
router.get("/:id", authenticate, getAppointmentById);

// 6. Cancelar una cita
router.patch("/:id/cancel", authenticate, cancelAppointment);

// 7. Actualizar estado de cita (mecánicos y administradores)
router.patch("/:id/status", authenticate, authorizeRoles("mecanico", "admin"), updateAppointmentStatus);

// 8. Registrar/actualizar informe técnico (mecánicos y administradores)
router.post("/:id/report", authenticate, authorizeRoles("mecanico", "admin"), saveTechnicalReport);

// 9. Ver informe técnico de la cita
router.get("/:id/report", authenticate, getAppointmentReport);

export default router;
