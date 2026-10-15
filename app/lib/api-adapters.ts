// Adaptadores: convierten las respuestas de la API (api-types.ts) en los tipos que usan las pantallas.
// Así las vistas no dependen de la forma exacta del backend (objetos anidados, campos nulos, etc.).

import type { ApiAgendaItem, ApiAvailability, ApiMyAppointment, ApiReport, ApiUser, ApiVehicle } from "./api-types";
import type { SlotAvailability } from "./availability";
import type { PortalAppointment, PortalReport, PortalVehicle, SessionUser } from "./portal-types";
import type { AgendaItem } from "./workshop-mocks";

const NO_VEHICLE_LABEL = "Sin vehículo registrado";
const DEFAULT_MECHANIC_NAME = "Equipo Grúas Cares";

export function vehicleLabel(vehicle: { brand: string; model: string; year?: number | null } | null | undefined): string {
  if (!vehicle) return NO_VEHICLE_LABEL;
  return `${vehicle.brand} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ""}`;
}

export function toSessionUser(user: ApiUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? null,
    isActive: user.isActive ?? true,
    createdAt: user.createdAt ?? new Date().toISOString(),
  };
}

export function toPortalVehicle(vehicle: ApiVehicle): PortalVehicle {
  return {
    id: vehicle.id,
    plate: vehicle.plate,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year ?? null,
    mileage: vehicle.mileage ?? 0,
  };
}

export function toPortalReport(appointmentId: string, report: ApiReport): PortalReport {
  return {
    appointmentId,
    mechanicName: report.mechanicName ?? report.mechanic?.name ?? DEFAULT_MECHANIC_NAME,
    observations: report.observations,
    partsReplaced: report.partsReplaced ?? null,
    mileageAtService: report.mileageAtService ?? null,
    recommendations: report.recommendations ?? null,
    completedAt: report.completedAt,
  };
}

export function toPortalAppointment(item: ApiMyAppointment): PortalAppointment {
  return {
    id: item.id,
    serviceName: item.service?.name ?? "Servicio",
    serviceCategory: item.service?.category ?? "serviteca",
    vehiclePlate: item.vehicle?.plate ?? "",
    vehicleLabel: vehicleLabel(item.vehicle),
    scheduledDate: item.scheduledDate,
    timeSlot: item.timeSlot,
    status: item.status,
    location: item.location ?? null,
    notes: item.notes ?? null,
  };
}

/** Informe de una cita solo si existe (las citas sin informe llegan con `report: null`). */
export function toPortalReportOrNull(item: ApiMyAppointment): PortalReport | null {
  return item.report && item.report.observations ? toPortalReport(item.id, item.report) : null;
}

export function toAgendaItem(item: ApiAgendaItem): AgendaItem {
  return {
    id: item.id,
    date: item.scheduledDate,
    timeSlot: item.timeSlot,
    clientName: item.client?.name ?? "Cliente sin nombre",
    clientPhone: item.client?.phone ?? "",
    vehiclePlate: item.vehicle?.plate ?? "",
    vehicleLabel: vehicleLabel(item.vehicle),
    serviceName: item.service?.name ?? "Servicio",
    status: item.status,
    notes: item.notes ?? null,
    mechanicId: item.mechanicId ?? null,
  };
}

export function toSlotAvailability(availability: ApiAvailability): SlotAvailability[] {
  return availability.slots.map((slot) => ({ time: slot.time, available: slot.available, reason: slot.reason }));
}
