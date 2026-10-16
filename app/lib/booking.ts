// Reglas de presentación del agendamiento: agrupar servicios, buscar uno por nombre y etiquetar horarios.

import type { ApiService } from "./api-types";
import type { IconName } from "../components/Icon";
import type { SlotAvailability } from "./availability";

export type BookingCategory = "serviteca" | "gruas";

export const CATEGORY_INFO: Record<BookingCategory, { label: string; description: string; icon: IconName }> = {
  serviteca: { label: "Serviteca y Taller", description: "Mantenciones preventivas, cambio de aceite y frenos.", icon: "wrench" },
  gruas: { label: "Grúa y Asistencia", description: "Rescate en ruta, traslado de vehículos y maquinaria pesada.", icon: "truck" },
};

export function categoryKey(category: ApiService["category"]): BookingCategory {
  return category === "grua" ? "gruas" : "serviteca";
}

export function groupServices(services: ApiService[]): Record<BookingCategory, ApiService[]> {
  const groups: Record<BookingCategory, ApiService[]> = { serviteca: [], gruas: [] };
  for (const service of services) groups[categoryKey(service.category)].push(service);
  return groups;
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Busca un servicio por el nombre recibido en `?servicio=`: exacto primero, luego por contención. */
export function findServiceByQuery(services: ApiService[], query: string | null | undefined): ApiService | null {
  if (!query) return null;
  const wanted = normalize(query);
  if (!wanted) return null;
  return (
    services.find((s) => normalize(s.name) === wanted) ??
    services.find((s) => normalize(s.name).includes(wanted) || wanted.includes(normalize(s.name))) ??
    null
  );
}

export function serviceHint(service: ApiService): string {
  if (service.category === "grua") return "Atención 24/7: coordinamos contigo por teléfono";
  return `${service.estimatedDurationMin} min aprox.`;
}

export function slotStatusLabel(slot: SlotAvailability & { capacityRemaining?: number }): string {
  if (slot.available) return "Disponible";
  if (slot.reason?.toLowerCase().includes("transcurrido")) return "Ya pasó";
  if (slot.reason) return "No disponible";
  return "Ocupado";
}
