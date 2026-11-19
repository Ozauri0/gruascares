import { Router } from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { createCrane, createCraneType, listCraneTypes, listCranes, updateCrane } from "../controllers/cranes.controller.js";

const router = Router();

// La flota la gestionan el jefe de grúas y el admin.
router.use(authenticate, authorizeRoles("grua", "admin"));

router.get("/", listCranes);
router.get("/types", listCraneTypes);
router.post("/types", createCraneType);
router.post("/", createCrane);
router.patch("/:id", updateCrane);

export default router;
