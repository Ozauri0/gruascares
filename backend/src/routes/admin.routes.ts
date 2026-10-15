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
import { createProduct, deleteProduct, getAdminCatalog, updateProduct } from "../controllers/catalog.controller.js";
import { createStaffUser, listUsers, updateUser } from "../controllers/admin-users.controller.js";
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

// Gestión de usuarios y personal
router.get("/users", listUsers);
router.post("/users", createStaffUser);
router.patch("/users/:id", updateUser);

// Catálogo de productos (la lectura pública está en GET /api/catalog)
router.get("/catalog", getAdminCatalog);
router.post("/catalog", createProduct);
router.patch("/catalog/:id", updateProduct);
router.delete("/catalog/:id", deleteProduct);

// 3. [T1.10] Auditoría y Respaldo de Datos
router.get("/audit-logs", getAuditLogs);
router.get("/export/appointments", exportAppointments);

export default router;
