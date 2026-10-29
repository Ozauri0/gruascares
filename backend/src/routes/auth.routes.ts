import { Router } from "express";
import { register, login, getMe, logout, logoutAll, changePassword, updateProfile, forgotPassword, resetPassword, verifyEmail, resendVerification } from "../controllers/auth.controller.js";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// Rutas Públicas
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);

// Rutas Protegidas
router.get("/me", authenticate, getMe);
router.patch("/me", authenticate, updateProfile);
router.post("/logout-all", authenticate, logoutAll);
router.post("/change-password", authenticate, changePassword);

// Rutas de Verificación RBAC (Control de acceso por rol)
router.get("/admin-check", authenticate, authorizeRoles("admin"), (req, res) => {
  res.json({ message: "Acceso autorizado para Administradores", user: req.user });
});

router.get("/mechanic-check", authenticate, authorizeRoles("admin", "mecanico"), (req, res) => {
  res.json({ message: "Acceso autorizado para Taller / Mecánicos", user: req.user });
});

export default router;
