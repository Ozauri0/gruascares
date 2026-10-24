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
  assignAppointmentWorker,
  getAuditLogs,
  exportAppointments,
} from "../controllers/admin.controller.js";
import { downloadAreaReport } from "../controllers/reports.controller.js";
import { getWorkerStats } from "../controllers/stats.controller.js";
import { discardDraft, getDraft, publishDraft, saveDraft, updateContent, uploadImage } from "../controllers/content.controller.js";
import { createProduct, deleteProduct, getAdminCatalog, updateProduct } from "../controllers/catalog.controller.js";
import { createStaffUser, deleteUser, listUsers, updateUser } from "../controllers/admin-users.controller.js";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// Todas las rutas de administración requieren autenticación; cada grupo define sus roles.
router.use(authenticate);

// Catálogo de productos (la lectura pública está en GET /api/catalog). También lo gestiona el vendedor.
const catalogAccess = authorizeRoles("admin", "vendedor");
router.get("/catalog", catalogAccess, getAdminCatalog);
router.post("/catalog", catalogAccess, createProduct);
router.patch("/catalog/:id", catalogAccess, updateProduct);
router.delete("/catalog/:id", catalogAccess, deleteProduct);
router.post("/uploads", catalogAccess, express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "5mb" }), uploadImage);

// El resto de la administración es solo del admin
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
router.patch("/appointments/:id/assign", assignAppointmentWorker);

// Gestión de usuarios y personal
router.get("/users", listUsers);
router.post("/users", createStaffUser);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// Contenido editable de la web pública (la lectura pública está en GET /api/content)
router.put("/content", updateContent);
router.get("/content/draft", getDraft);
router.put("/content/draft", saveDraft);
router.delete("/content/draft", discardDraft);
router.post("/content/publish", publishDraft);

// 3. [T1.10] Auditoría y Respaldo de Datos
router.get("/audit-logs", getAuditLogs);
router.get("/export/appointments", exportAppointments);

// Reportes Excel de taller y grúas (quién pidió, quién se encargó, informe técnico y resumen por trabajador)
router.get("/reports/:area", downloadAreaReport);
router.get("/stats/workers", getWorkerStats);

export default router;
