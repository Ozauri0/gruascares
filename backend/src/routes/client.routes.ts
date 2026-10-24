import { Router } from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { createWalkInClient, getClientByRut } from "../controllers/walk-in.controller.js";

const clientRouter = Router();

// Buscar cliente por RUT (accesible a ventas, taller y admin)
clientRouter.get("/by-rut", authenticate, authorizeRoles("vendedor", "mecanico", "admin"), getClientByRut);
clientRouter.get("/by-rut/:rut", authenticate, authorizeRoles("vendedor", "mecanico", "admin"), getClientByRut);

// Crear perfil presencial sin cuenta (solo ventas y admin; otros roles reciben 403)
clientRouter.post("/", authenticate, authorizeRoles("vendedor", "admin"), createWalkInClient);

export default clientRouter;
