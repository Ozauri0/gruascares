import { Router } from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { createWalkInClient, getClientByRut } from "../controllers/walk-in.controller.js";

const clientRouter = Router();

// Todo lo que se hace por RUT en el mostrador es solo de ventas y del admin (#144)
clientRouter.get("/by-rut", authenticate, authorizeRoles("vendedor", "admin"), getClientByRut);
clientRouter.get("/by-rut/:rut", authenticate, authorizeRoles("vendedor", "admin"), getClientByRut);

// Crear perfil presencial sin cuenta (taller y grúas reciben 403)
clientRouter.post("/", authenticate, authorizeRoles("vendedor", "admin"), createWalkInClient);

export default clientRouter;
