// Atención presencial y consulta/registro de clientes por RUT (backend/src/controllers/client.controller.ts y appointment.controller.ts).

import { apiGet, apiPost, ApiError } from "./api";
import { toPortalVehicle } from "./api-adapters";
import type { ApiVehicle } from "./api-types";
import type { CreatedAppointment } from "./appointments-api";
import { normalizePlate } from "./plate";
import type { PortalVehicle } from "./portal-types";
import { normalizeRut } from "./rut";

export type WalkInClient = {
  id: string;
  rut: string;
  name: string;
  email: string | null;
  phone: string | null;
  hasAccount?: boolean;
};

export type WalkInLookupResult = {
  client: WalkInClient;
  vehicles: PortalVehicle[];
};

/**
 * Busca un cliente por RUT (personal de taller, ventas o administración).
 * Devuelve `null` si no existe un cliente con ese RUT (404).
 */
export async function lookupClientByRut(rut: string, signal?: AbortSignal): Promise<WalkInLookupResult | null> {
  try {
    const data = await apiGet<{ client: WalkInClient; vehicles: ApiVehicle[] }>(
      `/api/clients/by-rut?rut=${encodeURIComponent(normalizeRut(rut))}`,
      undefined,
      { signal }
    );
    return {
      client: data.client,
      vehicles: (data.vehicles ?? []).map(toPortalVehicle),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export type CreateWalkInClientInput = {
  name: string;
  rut: string;
  phone: string;
  email?: string;
};

/**
 * Registra o actualiza un perfil presencial por RUT (solo ventas o administración).
 */
export async function createWalkInClient(input: CreateWalkInClientInput): Promise<WalkInClient> {
  const body = {
    name: input.name.trim(),
    rut: normalizeRut(input.rut),
    phone: input.phone.trim(),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
  };
  const data = await apiPost<{ client?: WalkInClient; user?: WalkInClient }>("/api/clients", body);
  return (data.client ?? data.user)!;
}

export type CreateWalkInAppointmentInput = {
  serviceId: string;
  scheduledDate: string;
  timeSlot: string;
  location?: string;
  /** Solo grúas: qué se traslada, destino y datos de la carga. */
  cargoType?: string;
  destination?: string;
  cargoDetails?: string;
  notes?: string;
  /** Solo ventas y admin: agenda aunque el calendario maestro tenga bloqueado ese día u horario. */
  ignoreBlocks?: boolean;
  userId?: string;
  rut?: string;
  client?: {
    name: string;
    rut: string;
    phone: string;
    email?: string;
  };
  vehicleId?: string;
  newVehicle?: {
    plate: string;
    brand: string;
    model: string;
    year?: number;
    mileage?: number;
  };
};

/**
 * Crea una cita presencial a nombre de un cliente existente (`userId` o `rut`) o registrándolo en el momento (`client`),
 * y opcionalmente registrando su vehículo en el acto (`newVehicle`).
 */
export async function createWalkInAppointment(input: CreateWalkInAppointmentInput): Promise<CreatedAppointment> {
  const payload: Record<string, unknown> = {
    serviceId: input.serviceId,
    scheduledDate: input.scheduledDate,
    timeSlot: input.timeSlot,
  };
  if (input.location?.trim()) payload.location = input.location.trim();
  if (input.cargoType) payload.cargoType = input.cargoType;
  if (input.destination?.trim()) payload.destination = input.destination.trim();
  if (input.cargoDetails?.trim()) payload.cargoDetails = input.cargoDetails.trim();
  if (input.notes?.trim()) payload.notes = input.notes.trim();
  if (input.ignoreBlocks) payload.ignoreBlocks = true;
  if (input.userId) payload.userId = input.userId;
  if (input.rut) payload.rut = normalizeRut(input.rut);
  if (input.client) {
    payload.client = {
      name: input.client.name.trim(),
      rut: normalizeRut(input.client.rut),
      phone: input.client.phone.trim(),
      ...(input.client.email?.trim() ? { email: input.client.email.trim() } : {}),
    };
  }
  if (input.vehicleId) payload.vehicleId = input.vehicleId;
  if (input.newVehicle) {
    payload.newVehicle = {
      plate: normalizePlate(input.newVehicle.plate),
      brand: input.newVehicle.brand.trim(),
      model: input.newVehicle.model.trim(),
      ...(input.newVehicle.year !== undefined ? { year: input.newVehicle.year } : {}),
      ...(input.newVehicle.mileage !== undefined ? { mileage: input.newVehicle.mileage } : {}),
    };
  }
  const { appointment } = await apiPost<{ appointment: CreatedAppointment }>("/api/appointments", payload);
  return appointment;
}
