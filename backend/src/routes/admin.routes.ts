import express, { Router } from "express";
import {
  getAdminMetrics,
  getBlockedDates,
  createBlockedDate,
  deleteBlockedDate,
  getDaySchedule,
  bulkBlockDates,
  bulkUnblockDates,
  rescheduleAppointment,
  createTimeSlot,
  deleteTimeSlot,
  reassignAppointmentMechanic,
  getAuditLogs,
  exportAppointments,
} from "../controllers/admin.controller.js";
import { updateContent, uploadImage } from "../controllers/content.controller.js";
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
router.post("/blocked-dates/bulk", bulkBlockDates);
router.post("/blocked-dates/bulk-remove", bulkUnblockDates);
router.delete("/blocked-dates/:id", deleteBlockedDate);
router.get("/schedule", getDaySchedule);
router.post("/time-slots", createTimeSlot);
router.delete("/time-slots/:id", deleteTimeSlot);
router.patch("/appointments/:id/reschedule", rescheduleAppointment);
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

// Contenido editable de la web pública (la lectura pública está en GET /api/content)
router.put("/content", updateContent);
router.post("/uploads", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "5mb" }), uploadImage);

// 3. [T1.10] Auditoría y Respaldo de Datos
router.get("/audit-logs", getAuditLogs);
router.get("/export/appointments", exportAppointments);

export default router;
