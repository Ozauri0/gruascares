import type { AppointmentStatus } from "./portal-types";

/** Una cita en la agenda del taller (la API la entrega con datos del cliente, vehículo y trabajador a cargo). */
export type AgendaItem = {
  id: string;
  date: string;
  timeSlot: string;
  clientName: string;
  clientRut?: string;
  clientEmail?: string | null;
  clientPhone: string;
  vehiclePlate: string;
  vehicleLabel: string;
  serviceName: string;
  status: AppointmentStatus;
  notes: string | null;
  /** Dónde se atiende; en una grúa, el lugar de retiro. */
  location: string | null;
  /** Solo grúas: qué se traslada, destino y datos de la carga. */
  cargoType: string | null;
  destination: string | null;
  cargoDetails: string | null;
  /** Categoría del servicio: define qué trabajadores pueden atenderla. */
  category: "grua" | "serviteca";
  workerId: string | null;
  /** Nombre del trabajador a cargo. */
  workerName?: string | null;
  /** Solo grúas: la grúa de la flota que hace el servicio. */
  craneId?: string | null;
  craneName?: string | null;
  cranePlate?: string | null;
  /** Jefe de área que gestionó la solicitud por última vez. */
  managedByName?: string | null;
};
