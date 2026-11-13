// Número de WhatsApp de Grúas Cares (verificado en la web original: +56 9 9162 7809) y armado del enlace wa.me.
export const WHATSAPP_PHONE = "56991627809";

export function cuentaWhatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

/** Mensaje prellenado con los datos del formulario de contacto de la portada. */
export function contactMessage(data: { name: string; phone: string; service: string; details?: string }): string {
  const lines = [
    "Hola, quiero coordinar un servicio con Grúas Cares.",
    `Nombre: ${data.name.trim()}`,
    `Teléfono: ${data.phone.trim()}`,
    `Servicio: ${data.service}`,
  ];
  if (data.details?.trim()) lines.push(`Detalle: ${data.details.trim()}`);
  return lines.join("\n");
}
