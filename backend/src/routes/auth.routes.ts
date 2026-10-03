import { Router } from "express";
import { register, login, getMe, logout } from "../controllers/auth.controller.js";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// Rutas Públicas
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

// Rutas Protegidas
router.get("/me", authenticate, getMe);

// Rutas de Verificación RBAC (Control de acceso por rol)
router.get("/admin-check", authenticate, authorizeRoles("admin"), (req, res) => {
  res.json({ message: "Acceso autorizado para Administradores", user: req.user });
});

router.get("/mechanic-check", authenticate, authorizeRoles("admin", "mecanico"), (req, res) => {
  res.json({ message: "Acceso autorizado para Taller / Mecánicos", user: req.user });
});

export default router;
