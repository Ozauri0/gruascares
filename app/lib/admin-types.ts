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
export type StaffMember = { id: string; name: string; role: "mecanico" | "vendedor" | "admin" };

/** Un horario del día en el calendario maestro (predefinido o propio), con su carga y bloqueo. */
export type DaySlot = {
  time: string;
  custom: boolean;
  customId: string | null;
  booked: number;
  block: { id: string; reason: string } | null;
};
export type DaySchedule = { date: string; capacityPerSlot: number; slots: DaySlot[] };
