// Contratos de respuesta del backend (backend/src/controllers/*). Describen la forma EXACTA que
// devuelve la API; las pantallas usan los tipos de `portal-types.ts` vía `api-adapters.ts`.
import type { AppointmentStatus, UserRole } from "./portal-types";

export type ApiErrorBody = { error: string; message: string };

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  isActive?: boolean;
  createdAt?: string;
};

export type ApiVehicle = {
  id: string;
  userId?: string;
  plate: string;
  brand: string;
  model: string;
  year: number | null;
  mileage: number | null;
  notes?: string | null;
};

export type ApiService = {
  id: string;
  category: "grua" | "serviteca";
  name: string;
  description: string | null;
  basePrice: number;
  estimatedDurationMin: number;
};

export type ApiSlot = {
  time: string;
  bookedCount: number;
  capacityRemaining: number;
  available: boolean;
  reason?: string;
};

export type ApiAvailability = { date: string; capacityPerSlot: number; slots: ApiSlot[] };

export type ApiReport = {
  id?: string;
  observations: string;
  partsReplaced: string | null;
  mileageAtService: number | null;
  recommendations: string | null;
  completedAt: string;
  /** GET /api/appointments/my entrega solo el nombre; el detalle del informe entrega el objeto `mechanic`. */
  mechanicName?: string | null;
  mechanic?: { id: string; name: string; email?: string } | null;
};

/** GET /api/appointments/my */
export type ApiMyAppointment = {
  id: string;
  scheduledDate: string;
  timeSlot: string;
  status: AppointmentStatus;
  location: string | null;
  notes: string | null;
  createdAt?: string;
  service: { id: string; name: string; category: "grua" | "serviteca"; basePrice?: number; estimatedDurationMin?: number } | null;
  vehicle: { id: string; plate: string; brand: string; model: string; year: number | null } | null;
  report: ApiReport | null;
};

/** GET /api/mechanic/agenda */
export type ApiAgendaItem = {
  id: string;
  scheduledDate: string;
  timeSlot: string;
  status: AppointmentStatus;
  location: string | null;
  notes: string | null;
  mechanicId?: string | null;
  mechanicName?: string | null;
  client: { id: string | null; name: string | null; email: string | null; phone: string | null; isGuest: boolean };
  vehicle: { id: string; plate: string; brand: string; model: string; year: number | null; mileage: number | null } | null;
  service: { id: string; category: "grua" | "serviteca"; name: string } | null;
  report: ApiReport | null;
};

/** GET /api/admin/metrics */
export type ApiMetrics = {
  appointments: {
    total: number;
    byStatus: Record<string, number>;
    today: { date: string; total: number; byStatus: Record<string, number> };
    week: { start: string; end: string; total: number; byCategory: { grua: number; serviteca: number } };
  };
  vehicles: { total: number; served: number };
  todayAgenda: {
    id: string;
    timeSlot: string;
    status: AppointmentStatus;
    serviceName: string;
    clientName: string;
    vehiclePlate: string | null;
  }[];
  users: { total: number; byRole: { admin: number; mecanico: number; usuario: number }; newClientsLast30Days: number };
};

/** GET /api/admin/blocked-dates */
export type ApiBlockedDate = { id: string; date: string; timeSlot: string | null; reason: string };

/** GET /api/catalog (público) y /api/admin/catalog (incluye `active`). */
export type ApiProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  tag: string | null;
  art: "tyre" | "oil" | "battery";
  image: string | null;
  featured: boolean;
  active?: boolean;
};

export type ApiAdminUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "mecanico" | "usuario";
  phone: string | null;
  isActive: boolean;
  createdAt: string;
};
