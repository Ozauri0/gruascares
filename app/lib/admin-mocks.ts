// Datos demostrativos del panel de administración.
// Contratos futuros:
// - GET /api/admin/metrics -> { metrics: AdminMetrics } (T1.8)
// - GET /api/admin/users -> { users: SessionUser[] } (T1.9/T1.10)
import type { SessionUser } from "./portal-types";

export type AdminMetrics = {
  appointmentsToday: number;
  appointmentsWeek: number;
  totalClients: number;
  totalVehicles: number;
  byCategory: { category: "grua" | "serviteca"; label: string; count: number }[];
  todayAgenda: {
    id: string;
    timeSlot: string;
    serviceName: string;
    clientName: string;
    vehiclePlate: string;
    status: "solicitada" | "confirmada" | "en_proceso" | "finalizada" | "cancelada";
  }[];
};

export const MOCK_USERS: SessionUser[] = [
  { id: "u-admin", name: "Carlos Cares", email: "admin@gruascares.cl", role: "admin", phone: "+56 9 9162 7809", isActive: true, createdAt: "2025-03-02T12:00:00.000Z" },
  { id: "u-mec1", name: "Juan Paredes", email: "juan.paredes@gruascares.cl", role: "mecanico", phone: "+56 9 6832 7329", isActive: true, createdAt: "2025-06-10T12:00:00.000Z" },
  { id: "u-mec2", name: "Diego Fuentes", email: "diego.fuentes@gruascares.cl", role: "mecanico", phone: "+56 9 6857 4677", isActive: false, createdAt: "2026-01-15T12:00:00.000Z" },
  { id: "u-cli1", name: "María González", email: "maria.gonzalez@ejemplo.cl", role: "usuario", phone: "+56 9 1234 5678", isActive: true, createdAt: "2026-09-14T12:00:00.000Z" },
  { id: "u-cli2", name: "Pedro Soto", email: "pedro.soto@ejemplo.cl", role: "usuario", phone: "+56 9 8765 4321", isActive: true, createdAt: "2026-09-20T12:00:00.000Z" },
  { id: "u-cli3", name: "Ana Paredes", email: "ana.paredes@ejemplo.cl", role: "usuario", phone: null, isActive: true, createdAt: "2026-09-28T12:00:00.000Z" },
];

export const MOCK_METRICS: AdminMetrics = {
  appointmentsToday: 6,
  appointmentsWeek: 23,
  totalClients: 148,
  totalVehicles: 203,
  byCategory: [
    { category: "serviteca", label: "Serviteca", count: 15 },
    { category: "grua", label: "Grúas", count: 8 },
  ],
  todayAgenda: [
    { id: "m-1", timeSlot: "08:30", serviceName: "Cambio de aceite", clientName: "María González", vehiclePlate: "ABCD12", status: "finalizada" },
    { id: "m-2", timeSlot: "09:30", serviceName: "Mantención preventiva 10.000 km", clientName: "Pedro Soto", vehiclePlate: "JKLM56", status: "en_proceso" },
    { id: "m-3", timeSlot: "10:30", serviceName: "Grúa de plataforma hidráulica", clientName: "Ana Paredes", vehiclePlate: "QRST78", status: "confirmada" },
    { id: "m-4", timeSlot: "11:30", serviceName: "Cambio de neumáticos", clientName: "Luis Fuentes", vehiclePlate: "UVWX90", status: "confirmada" },
    { id: "m-5", timeSlot: "14:00", serviceName: "Revisión preventiva", clientName: "Carla Muñoz", vehiclePlate: "EFGH34", status: "solicitada" },
    { id: "m-6", timeSlot: "15:00", serviceName: "Transporte de cargas pesadas", clientName: "Jorge Díaz", vehiclePlate: "IJKL12", status: "solicitada" },
  ],
};
