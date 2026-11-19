import { Router } from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { createCrane, listCranes, updateCrane } from "../controllers/cranes.controller.js";
import { createCraneType, deleteCraneType, listCraneTypes, renameCraneType, reorderCraneTypes } from "../controllers/crane-types.controller.js";

const router = Router();

// La flota y sus tipos los gestionan el jefe de grúas y el admin.
router.use(authenticate, authorizeRoles("grua", "admin"));

router.get("/", listCranes);
router.post("/", createCrane);
router.get("/types", listCraneTypes);
router.post("/types", createCraneType);
router.put("/types/order", reorderCraneTypes);
router.patch("/types/:id", renameCraneType);
router.delete("/types/:id", deleteCraneType);
router.patch("/:id", updateCrane);

export default router;
