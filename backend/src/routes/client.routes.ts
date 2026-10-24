import { Router } from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";
import { createWalkInClient, getClientByRut } from "../controllers/walk-in.controller.js";

const clientRouter = Router();

// Todo lo que se hace por RUT en el mostrador es solo del perfil de ventas (#144)
clientRouter.get("/by-rut", authenticate, authorizeRoles("vendedor"), getClientByRut);
clientRouter.get("/by-rut/:rut", authenticate, authorizeRoles("vendedor"), getClientByRut);

// Crear perfil presencial sin cuenta (otros roles, admin incluido, reciben 403)
clientRouter.post("/", authenticate, authorizeRoles("vendedor"), createWalkInClient);

export default clientRouter;
