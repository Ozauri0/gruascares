import { Router, Request, Response } from "express";
import {
  getWelcomeEmailTemplate,
  getAppointmentConfirmationTemplate,
  getServiceCompletedTemplate,
} from "../services/email/templates.js";
import {
  sendWelcomeEmail,
  sendAppointmentConfirmationEmail,
  sendServiceCompletedEmail,
} from "../services/email/email.service.js";

const router = Router();

// Endpoint para previsualizar HTML de las plantillas directamente en el navegador
router.get("/preview/:type", (req: Request, res: Response) => {
  const { type } = req.params;

  if (type === "welcome") {
    const template = getWelcomeEmailTemplate("Juan Pérez");
    return res.send(template.html);
  }

  if (type === "appointment") {
    const template = getAppointmentConfirmationTemplate({
      name: "Juan Pérez",
      serviceName: "Cambio de aceite y filtro",
      scheduledDate: "2026-10-15",
      timeSlot: "10:30",
      vehiclePlate: "ABCD-12",
      vehicleBrandModel: "Toyota Hilux 4x4",
      status: "confirmada",
      location: "Taller Grúas Cares, Villarrica",
      notes: "Por favor revisar también nivel de refrigerante.",
    });
    return res.send(template.html);
  }

  if (type === "completed") {
    const template = getServiceCompletedTemplate({
      name: "Juan Pérez",
      vehiclePlate: "ABCD-12",
      vehicleInfo: "Toyota Hilux 4x4 (2022)",
      serviceName: "Cambio de aceite y filtro",
      mechanicName: "Carlos Mecánico",
      mileageAtService: 65420,
      observations: "Se realizó cambio de aceite sintético 10W-40 y filtro de aceite original. Se inspeccionaron frenos y niveles generales en óptimo estado.",
      partsReplaced: "Filtro OEM Toyota 90915-YZZD2, 6L Aceite Shell Rimula R6 10W40",
      recommendations: "Revisar rotación y desgaste de neumáticos en 5.000 km.",
      completedAt: "03/10/2026 15:45",
    });
    return res.send(template.html);
  }

  return res.status(404).json({
    error: "Not Found",
    message: "Plantilla no encontrada. Opciones: welcome, appointment, completed",
  });
});

// Endpoint para disparar un correo de prueba
router.post("/test", async (req: Request, res: Response) => {
  const { to, type = "welcome" } = req.body;

  const targetEmail = to || "test@gruascares.cl";

  if (type === "welcome") {
    await sendWelcomeEmail(targetEmail, "Usuario de Prueba");
  } else if (type === "appointment") {
    await sendAppointmentConfirmationEmail(targetEmail, {
      name: "Usuario de Prueba",
      serviceName: "Grúa de plataforma hidráulica",
      scheduledDate: "2026-10-10",
      timeSlot: "14:00",
      status: "solicitada",
      location: "Camino Villarrica - Pucón km 5",
    });
  } else if (type === "completed") {
    await sendServiceCompletedEmail(targetEmail, {
      name: "Usuario de Prueba",
      vehiclePlate: "TEST-99",
      vehicleInfo: "Camión Grúa Mercedes",
      serviceName: "Revisión general de vehículo",
      mechanicName: "Carlos Mecánico",
      mileageAtService: 120000,
      observations: "Mantenimiento preventivo completado con éxito.",
      completedAt: new Date().toLocaleDateString("es-CL"),
    });
  }

  return res.json({
    message: `Disparo de prueba de correo tipo '${type}' procesado hacia '${targetEmail}'.`,
    type,
    recipient: targetEmail,
  });
});

export default router;
