import nodemailer from "nodemailer";
import { config } from "../../config/env.js";
import {
  getWelcomeEmailTemplate,
  getAppointmentConfirmationTemplate,
  getServiceCompletedTemplate,
  AppointmentEmailData,
  ServiceCompletedEmailData,
} from "./templates.js";

// Inicialización del transporte SMTP
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const isConfigured = Boolean(config.email.host && config.email.user && config.email.pass);

  if (isConfigured) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });
  } else {
    // Modo desarrollo / Mock cuando no hay credenciales SMTP configuradas
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });
  }

  return transporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envío de correo electrónico genérico con manejo de errores asíncrono.
 * Nunca lanza excepciones para no interrumpir el flujo principal de las peticiones HTTP.
 */
export async function sendEmail(options: SendMailOptions): Promise<boolean> {
  const { to, subject, html, text } = options;

  try {
    const isSmtpConfigured = Boolean(config.email.host && config.email.user && config.email.pass);
    const transport = getTransporter();

    console.log(`📧 [EmailService] Preparando envío para: ${to} | Asunto: "${subject}"`);

    const info = await transport.sendMail({
      from: config.email.from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>?/gm, ""),
    });

    if (isSmtpConfigured) {
      console.log(`✅ [EmailService] Correo enviado exitosamente a ${to}. ID: ${info.messageId}`);
    } else {
      console.log(`ℹ️ [EmailService (Mock)] Simulación de correo exitosa para ${to}. (Configura SMTP en .env para envío real)`);
    }

    return true;
  } catch (error) {
    console.error(`❌ [EmailService] Error al enviar correo a ${to}:`, error);
    // Retorna false sin lanzar el error para que la petición HTTP continúe normalmente
    return false;
  }
}

/**
 * Notificación de bienvenida al registrarse un nuevo usuario
 */
export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  // Ejecución asíncrona "fire-and-forget"
  const template = getWelcomeEmailTemplate(name);
  sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  }).catch((err) => console.error("Error en sendWelcomeEmail:", err));
}

/**
 * Notificación de confirmación de solicitud de cita
 */
export async function sendAppointmentConfirmationEmail(
  to: string,
  data: AppointmentEmailData
): Promise<void> {
  const template = getAppointmentConfirmationTemplate(data);
  sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  }).catch((err) => console.error("Error en sendAppointmentConfirmationEmail:", err));
}

/**
 * Notificación con hoja de atención técnica cuando la cita pasa a finalizada
 */
export async function sendServiceCompletedEmail(
  to: string,
  data: ServiceCompletedEmailData
): Promise<void> {
  const template = getServiceCompletedTemplate(data);
  sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  }).catch((err) => console.error("Error en sendServiceCompletedEmail:", err));
}
