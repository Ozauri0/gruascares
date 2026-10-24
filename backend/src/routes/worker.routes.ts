import { Router } from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { createWorker, listWorkers, updateWorker } from "../controllers/workers.controller.js";

const router = Router();

// Solo los jefes de área (taller y grúas) y el admin gestionan a los trabajadores, que no tienen cuenta.
router.use(authenticate, authorizeRoles("mecanico", "grua", "admin"));

router.get("/", listWorkers);
router.post("/", createWorker);
router.patch("/:id", updateWorker);

export default router;
