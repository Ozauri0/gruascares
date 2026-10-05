import { Router } from "express";
import {
  getAdminMetrics,
  getBlockedDates,
  createBlockedDate,
  deleteBlockedDate,
  reassignAppointmentMechanic,
  getAuditLogs,
  exportAppointments,
} from "../controllers/admin.controller.js";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// Todas las rutas de administración requieren autenticación y rol 'admin'
router.use(authenticate);
router.use(authorizeRoles("admin"));

// 1. [T1.8] Métricas y Reportes
router.get("/metrics", getAdminMetrics);

// 2. [T1.9] Gestión de Taller y Horarios
router.get("/blocked-dates", getBlockedDates);
router.post("/blocked-dates", createBlockedDate);
router.delete("/blocked-dates/:id", deleteBlockedDate);
router.patch("/appointments/:id/assign", reassignAppointmentMechanic);

// 3. [T1.10] Auditoría y Respaldo de Datos
router.get("/audit-logs", getAuditLogs);
router.get("/export/appointments", exportAppointments);

export default router;
