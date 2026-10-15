import type { AppointmentStatus } from "./portal-types";

/** Una cita en la agenda del taller (la API la entrega con datos del cliente, vehículo y mecánico). */
export type AgendaItem = {
  id: string;
  date: string;
  timeSlot: string;
  clientName: string;
  clientPhone: string;
  vehiclePlate: string;
  vehicleLabel: string;
  serviceName: string;
  status: AppointmentStatus;
  notes: string | null;
  mechanicId: string | null;
  /** Nombre del mecánico asignado. */
  mechanicName?: string | null;
};
