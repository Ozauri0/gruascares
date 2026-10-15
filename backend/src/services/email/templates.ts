import { escapeHtml, escapeMultiline, sanitizeHeader } from "../../utils/html.js";

export function baseEmailLayout(content: string, previewText: string = ""): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Grúas Cares</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;color:#111111;">
  ${previewText ? `<div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}</div>` : ""}
  
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f4f4f4;padding:30px 10px;">
    <tr>
      <td align="center">
        <!-- Contenedor Principal -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #e5e5e5;">
          
          <!-- Header Corporativo -->
          <tr>
            <td style="background-color:#000000;padding:26px 32px;text-align:left;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">GRÚAS <span style="color:#029834;">CARES</span></span>
                    <div style="font-size:11px;color:#aaaaaa;margin-top:3px;text-transform:uppercase;letter-spacing:1px;">Rescate y Transporte 24/7 · Villarrica</div>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;padding:5px 10px;background-color:rgba(2,152,52,0.2);color:#029834;border:1px solid #029834;border-radius:20px;font-size:11px;font-weight:600;">IX Región</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Contenido Dinámico -->
          <tr>
            <td style="padding:36px 32px 28px 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer Corporativo -->
          <tr>
            <td style="background-color:#f9f9f9;padding:24px 32px;border-top:1px solid #eeeeee;font-size:12px;color:#777777;line-height:1.6;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <strong style="color:#222222;display:block;margin-bottom:4px;">Grúas Cares Villarrica</strong>
                    <div>Atención de emergencias 24 horas en Villarrica y toda la Araucanía.</div>
                    <div style="margin-top:6px;">
                      Teléfonos de contacto: 
                      <a href="tel:+56991627809" style="color:#029834;text-decoration:none;font-weight:600;">+56 9 9162 7809</a> · 
                      <a href="tel:+56968327329" style="color:#029834;text-decoration:none;font-weight:600;">+56 9 6832 7329</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// 1. Plantilla de Bienvenida al Registrarse
export function getWelcomeEmailTemplate(name: string): { html: string; text: string; subject: string } {
  const subject = "¡Bienvenido a Grúas Cares!";
  const safeName = escapeHtml(name);
  const previewText = `Hola ${safeName}, tu cuenta ha sido creada exitosamente.`;
  const content = `
    <h1 style="font-size:24px;font-weight:700;color:#111111;margin:0 0 16px 0;letter-spacing:-0.5px;">¡Bienvenido, ${safeName}!</h1>
    <p style="font-size:15px;line-height:1.6;color:#444444;margin:0 0 20px 0;">
      Tu cuenta en la plataforma de <strong>Grúas Cares</strong> ha sido activada con éxito. Ya puedes acceder a tu portal de usuario para coordinar tus traslados y servicios de serviteca.
    </p>

    <div style="background-color:#f4faf5;border-left:4px solid #029834;padding:16px 20px;border-radius:4px;margin:24px 0;">
      <h3 style="margin:0 0 8px 0;font-size:14px;color:#017827;text-transform:uppercase;letter-spacing:0.5px;">¿Qué puedes hacer desde tu cuenta?</h3>
      <ul style="margin:0;padding-left:18px;font-size:14px;color:#444444;line-height:1.6;">
        <li>Registrar y administrar tus vehículos (autos, camionetas o camiones).</li>
        <li>Agendar horas de serviteca (cambio de aceite, neumáticos, mantenciones).</li>
        <li>Revisar tu historial y la hoja de vida técnica de atenciones pasadas.</li>
        <li>Solicitar asistencia y rescate de grúa las 24 horas.</li>
      </ul>
    </div>

    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:30px 0 10px 0;">
      <tr>
        <td align="center" style="border-radius:6px;background-color:#029834;">
          <a href="https://gruascares.cl/login" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;color:#ffffff;font-weight:700;text-decoration:none;border-radius:6px;">Ingresar a mi Portal ↗</a>
        </td>
      </tr>
    </table>
  `;

  return {
    subject,
    html: baseEmailLayout(content, previewText),
    text: `¡Bienvenido a Grúas Cares, ${name}!\n\nTu cuenta ha sido creada exitosamente. Ya puedes ingresar a tu portal de clientes en https://gruascares.cl/login para registrar tus vehículos y agendar tus atenciones. Para emergencias 24/7 llámanos al +56 9 9162 7809.`,
  };
}

// 2. Plantilla de Confirmación de Cita
export interface AppointmentEmailData {
  name: string;
  serviceName: string;
  scheduledDate: string;
  timeSlot: string;
  vehiclePlate?: string;
  vehicleBrandModel?: string;
  status: string;
  location?: string;
  notes?: string;
}

export function getAppointmentConfirmationTemplate(data: AppointmentEmailData): { html: string; text: string; subject: string } {
  const subject = sanitizeHeader(`Confirmación de Solicitud de Cita: ${data.serviceName}`);
  const e = {
    name: escapeHtml(data.name),
    serviceName: escapeHtml(data.serviceName),
    scheduledDate: escapeHtml(data.scheduledDate),
    timeSlot: escapeHtml(data.timeSlot),
    vehiclePlate: escapeHtml(data.vehiclePlate),
    vehicleBrandModel: escapeHtml(data.vehicleBrandModel),
    status: escapeHtml(data.status),
    location: escapeHtml(data.location),
    notes: escapeMultiline(data.notes),
  };
  const previewText = `Tu cita para ${e.serviceName} el ${e.scheduledDate} a las ${e.timeSlot} ha sido registrada.`;
  const content = `
    <h1 style="font-size:22px;font-weight:700;color:#111111;margin:0 0 14px 0;letter-spacing:-0.5px;">Solicitud de Servicio Registrada</h1>
    <p style="font-size:15px;line-height:1.6;color:#444444;margin:0 0 24px 0;">
      Hola <strong>${e.name}</strong>, hemos recibido tu solicitud de agendamiento. A continuación tienes el detalle de tu cita:
    </p>

    <!-- Ficha de la Cita -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#fafafa;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#777777;width:140px;">Servicio:</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111111;">${e.serviceName}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#777777;">Fecha preferida:</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:#017827;">${e.scheduledDate}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#777777;">Bloque horario:</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111111;">${e.timeSlot} hrs</td>
      </tr>
      ${data.vehiclePlate ? `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#777777;">Vehículo:</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111111;">${e.vehicleBrandModel || "Vehículo"} (Patente: ${e.vehiclePlate})</td>
      </tr>` : ""}
      ${data.location ? `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#777777;">Lugar o referencia:</td>
        <td style="padding:6px 0;font-size:14px;color:#111111;">${e.location}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#777777;">Estado:</td>
        <td style="padding:6px 0;">
          <span style="display:inline-block;padding:3px 10px;background-color:#e8f5e9;color:#029834;border-radius:12px;font-size:12px;font-weight:600;text-transform:capitalize;">${e.status}</span>
        </td>
      </tr>
    </table>

    ${data.notes ? `
    <p style="font-size:13px;color:#666666;font-style:italic;margin:0 0 20px 0;">
      Notas adicionales del cliente: "${e.notes}"
    </p>` : ""}

    <p style="font-size:14px;color:#555555;line-height:1.5;">
      Nuestro equipo confirmará la disponibilidad del box o grúa. Si tienes alguna urgencia o necesitas modificar la hora, llámanos directamente al <strong>+56 9 9162 7809</strong>.
    </p>
  `;

  return {
    subject,
    html: baseEmailLayout(content, previewText),
    text: `Hola ${e.name},\n\nHemos registrado tu solicitud de servicio:\n- Servicio: ${e.serviceName}\n- Fecha: ${e.scheduledDate} a las ${e.timeSlot}\n- Estado: ${e.status}\n\nPara consultas o emergencias 24/7 llámanos al +56 9 9162 7809.`,
  };
}

// 2b. Plantilla de cambio de fecha u hora de una cita (la hace el taller)
export interface AppointmentRescheduledEmailData {
  name: string;
  serviceName: string;
  previousDate: string;
  previousTimeSlot: string;
  scheduledDate: string;
  timeSlot: string;
}

export function getAppointmentRescheduledTemplate(data: AppointmentRescheduledEmailData): { html: string; text: string; subject: string } {
  const subject = sanitizeHeader(`Cambio de horario de tu cita: ${data.serviceName}`);
  const e = {
    name: escapeHtml(data.name),
    serviceName: escapeHtml(data.serviceName),
    previousDate: escapeHtml(data.previousDate),
    previousTimeSlot: escapeHtml(data.previousTimeSlot),
    scheduledDate: escapeHtml(data.scheduledDate),
    timeSlot: escapeHtml(data.timeSlot),
  };
  const previewText = `Tu cita de ${e.serviceName} ahora es el ${e.scheduledDate} a las ${e.timeSlot}.`;
  const content = `
    <h1 style="font-size:22px;font-weight:700;color:#111111;margin:0 0 14px 0;letter-spacing:-0.5px;">Cambiamos el horario de tu cita</h1>
    <p style="font-size:15px;line-height:1.6;color:#444444;margin:0 0 24px 0;">
      Hola <strong>${e.name}</strong>, el taller modificó la fecha u hora de tu cita de <strong>${e.serviceName}</strong>.
    </p>
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#fafafa;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#777777;width:140px;">Antes:</td>
        <td style="padding:6px 0;font-size:14px;color:#777777;text-decoration:line-through;">${e.previousDate} · ${e.previousTimeSlot} hrs</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#777777;">Ahora:</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:#017827;">${e.scheduledDate} · ${e.timeSlot} hrs</td>
      </tr>
    </table>
    <p style="font-size:14px;color:#555555;line-height:1.5;">
      Si este horario no te acomoda, llámanos al <strong>+56 9 9162 7809</strong> y lo coordinamos.
    </p>
  `;
  return {
    subject,
    html: baseEmailLayout(content, previewText),
    text: `Hola ${e.name},\n\nEl taller cambió el horario de tu cita de ${e.serviceName}:\n- Antes: ${e.previousDate} a las ${e.previousTimeSlot}\n- Ahora: ${e.scheduledDate} a las ${e.timeSlot}\n\nSi no te acomoda, llámanos al +56 9 9162 7809.`,
  };
}

// 3. Plantilla de Resumen de Atención Técnica Finalizada
export interface ServiceCompletedEmailData {
  name: string;
  vehiclePlate: string;
  vehicleInfo: string;
  serviceName: string;
  mechanicName: string;
  mileageAtService?: number | null;
  observations: string;
  partsReplaced?: string | null;
  recommendations?: string | null;
  completedAt: string;
}

export function getServiceCompletedTemplate(data: ServiceCompletedEmailData): { html: string; text: string; subject: string } {
  const subject = sanitizeHeader(`Hoja de Atención Finalizada · ${data.vehiclePlate} (${data.serviceName})`);
  const e = {
    name: escapeHtml(data.name),
    vehiclePlate: escapeHtml(data.vehiclePlate),
    vehicleInfo: escapeHtml(data.vehicleInfo),
    serviceName: escapeHtml(data.serviceName),
    mechanicName: escapeHtml(data.mechanicName),
    completedAt: escapeHtml(data.completedAt),
    observations: escapeMultiline(data.observations),
    partsReplaced: escapeMultiline(data.partsReplaced),
    recommendations: escapeMultiline(data.recommendations),
  };
  const previewText = `Tu atención para el vehículo ${e.vehiclePlate} ha finalizado. Revisa las observaciones técnicas.`;
  const content = `
    <h1 style="font-size:22px;font-weight:700;color:#111111;margin:0 0 12px 0;letter-spacing:-0.5px;">Atención Técnica Finalizada</h1>
    <p style="font-size:15px;line-height:1.6;color:#444444;margin:0 0 24px 0;">
      Estimado(a) <strong>${e.name}</strong>, el trabajo en tu vehículo <strong>${e.vehicleInfo}</strong> (Patente: <strong>${e.vehiclePlate}</strong>) ha sido completado por nuestro equipo técnico.
    </p>

    <!-- Resumen Técnico -->
    <div style="background-color:#ffffff;border:1px solid #dcdcdc;border-radius:8px;padding:20px;margin-bottom:20px;">
      <h3 style="margin:0 0 14px 0;font-size:15px;color:#029834;border-bottom:1px solid #eee;padding-bottom:8px;">Detalles de la Mantención</h3>
      
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#777;width:150px;">Servicio Realizado:</td>
          <td style="padding:5px 0;font-size:14px;font-weight:600;color:#111;">${e.serviceName}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#777;">Mecánico a cargo:</td>
          <td style="padding:5px 0;font-size:14px;color:#111;">${e.mechanicName}</td>
        </tr>
        ${data.mileageAtService ? `
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#777;">Kilometraje registrado:</td>
          <td style="padding:5px 0;font-size:14px;font-weight:600;color:#111;">${data.mileageAtService.toLocaleString("es-CL")} km</td>
        </tr>` : ""}
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#777;">Fecha de finalización:</td>
          <td style="padding:5px 0;font-size:14px;color:#111;">${e.completedAt}</td>
        </tr>
      </table>

      <!-- Observaciones -->
      <div style="margin-top:16px;padding-top:12px;border-top:1px dashed #e0e0e0;">
        <strong style="font-size:13px;color:#333;display:block;margin-bottom:6px;">Diagnóstico y Observaciones Técnicas:</strong>
        <p style="margin:0;font-size:14px;color:#444;line-height:1.5;background:#f9f9f9;padding:12px;border-radius:6px;">
          ${e.observations}
        </p>
      </div>

      <!-- Repuestos -->
      ${data.partsReplaced ? `
      <div style="margin-top:14px;">
        <strong style="font-size:13px;color:#333;display:block;margin-bottom:6px;">Insumos / Repuestos Utilizados:</strong>
        <p style="margin:0;font-size:14px;color:#444;line-height:1.5;background:#f9f9f9;padding:12px;border-radius:6px;">
          ${e.partsReplaced}
        </p>
      </div>` : ""}

      <!-- Recomendaciones -->
      ${data.recommendations ? `
      <div style="margin-top:14px;background-color:#fffde7;border-left:4px solid #fbc02d;padding:12px 14px;border-radius:4px;">
        <strong style="font-size:13px;color:#f57f17;display:block;margin-bottom:4px;">Recomendación para tu próxima visita:</strong>
        <div style="font-size:13px;color:#555;line-height:1.5;">${e.recommendations}</div>
      </div>` : ""}
    </div>

    <p style="font-size:14px;color:#666666;line-height:1.6;">
      Este registro ha quedado guardado permanentemente en la hoja de vida de tu vehículo dentro de tu portal web. ¡Gracias por confiar en Grúas Cares!
    </p>
  `;

  return {
    subject,
    html: baseEmailLayout(content, previewText),
    text: `Estimado(a) ${data.name},\n\nLa atención técnica para tu vehículo ${data.vehiclePlate} (${data.serviceName}) ha finalizado.\n\nObservaciones: ${data.observations}\n${data.recommendations ? `Recomendaciones: ${data.recommendations}\n` : ""}\nFecha: ${data.completedAt}\n\nGracias por confiar en Grúas Cares.`,
  };
}

// 4. Plantilla de recuperación de contraseña
export function getPasswordResetTemplate(
  name: string,
  resetUrl: string,
  validMinutes: number
): { html: string; text: string; subject: string } {
  const subject = "Restablece tu contraseña · Grúas Cares";
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  const content = `
    <h1 style="font-size:22px;font-weight:700;color:#111111;margin:0 0 14px 0;letter-spacing:-0.5px;">Restablecer contraseña</h1>
    <p style="font-size:15px;line-height:1.6;color:#444444;margin:0 0 20px 0;">
      Hola <strong>${safeName}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta de Grúas Cares.
      El enlace es válido por <strong>${validMinutes} minutos</strong> y solo puede usarse una vez.
    </p>
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:26px 0;">
      <tr>
        <td align="center" style="border-radius:6px;background-color:#029834;">
          <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;color:#ffffff;font-weight:700;text-decoration:none;border-radius:6px;">Crear nueva contraseña ↗</a>
        </td>
      </tr>
    </table>
    <p style="font-size:13px;line-height:1.6;color:#666666;margin:0 0 8px 0;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
    <p style="font-size:12px;line-height:1.5;color:#029834;word-break:break-all;margin:0 0 20px 0;">${safeUrl}</p>
    <p style="font-size:13px;line-height:1.6;color:#666666;margin:0;">
      Si tú no lo solicitaste, ignora este correo: tu contraseña actual no cambiará.
    </p>
  `;
  return {
    subject,
    html: baseEmailLayout(content, "Enlace para restablecer tu contraseña de Grúas Cares."),
    text: `Hola ${name},\n\nRecibimos una solicitud para restablecer la contraseña de tu cuenta de Grúas Cares. Usa este enlace (válido por ${validMinutes} minutos, un solo uso):\n${resetUrl}\n\nSi no lo solicitaste, ignora este correo.`,
  };
}
