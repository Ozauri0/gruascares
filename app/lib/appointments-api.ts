// Servicios, disponibilidad y solicitud de citas contra el backend (backend/src/controllers/appointment.controller.ts).

import { apiGet, apiPost } from "./api";
import { toSlotAvailability } from "./api-adapters";
import type { ApiAvailability, ApiService } from "./api-types";
import type { SlotAvailability } from "./availability";

export async function listServices(signal?: AbortSignal): Promise<ApiService[]> {
  const { services } = await apiGet<{ services: ApiService[] }>("/api/appointments/services", undefined, { signal });
  return services;
}

export async function fetchAvailability(date: string, signal?: AbortSignal): Promise<SlotAvailability[]> {
  const availability = await apiGet<ApiAvailability>("/api/appointments/availability", { date }, { signal });
  return toSlotAvailability(availability);
}

export type CreateAppointmentInput = {
  serviceId: string;
  scheduledDate: string;
  timeSlot: string;
  /** Grúa: lugar de retiro. */
  location?: string;
  /** Solo grúas: qué se traslada, destino y datos de la carga. */
  cargoType?: string;
  destination?: string;
  cargoDetails?: string;
  notes?: string;
  /** Vehículo guardado en la cuenta (opcional). */
  vehicleId?: string;
};

export type CreatedAppointment = {
  id: string;
  scheduledDate: string;
  timeSlot: string;
  status: string;
  serviceName: string;
};

/** Exige sesión: un 401 (sesión vencida) lleva a /login y vuelve a /agendar al iniciar sesión. */
export async function createAppointment(input: CreateAppointmentInput): Promise<CreatedAppointment> {
  // Se omiten campos vacíos: el backend trata "" como dato presente en algunos casos.
  const body = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ""));
  const { appointment } = await apiPost<{ appointment: CreatedAppointment }>("/api/appointments", body);
  return appointment;
}
