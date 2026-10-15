// Tipos del panel de administración (lo que muestran las pantallas).
import type { AppointmentStatus } from "./portal-types";

export type AdminMetrics = {
  appointmentsToday: number;
  appointmentsWeek: number;
  totalClients: number;
  /** Vehículos atendidos: con al menos una atención finalizada. */
  totalVehicles: number;
  byCategory: { category: "grua" | "serviteca"; label: string; count: number }[];
  todayAgenda: {
    id: string;
    timeSlot: string;
    serviceName: string;
    clientName: string;
    vehiclePlate: string;
    status: AppointmentStatus;
  }[];
};

export type BlockedDay = { id: string; date: string; reason: string };
export type StaffMember = { id: string; name: string; role: "mecanico" | "admin" };
