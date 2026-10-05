import type { AppointmentStatus } from "./portal-types";

// Datos demostrativos del taller.
// Contratos futuros:
// - GET /api/mechanic/agenda?date=YYYY-MM-DD (T1.7)
// - PATCH /api/appointments/:id/status (T1.7)
// - POST /api/appointments/:id/report (T1.7)

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
};

export const MOCK_MECHANICS = [
  { id: "u-mec1", name: "Juan Paredes" },
  { id: "u-mec2", name: "Diego Fuentes" },
];

export const MOCK_AGENDA: AgendaItem[] = [
  { id: "w-1", date: "2026-10-05", timeSlot: "08:00", clientName: "María González", clientPhone: "+56 9 1234 5678", vehiclePlate: "ABCD12", vehicleLabel: "Toyota Hilux 2021", serviceName: "Cambio de aceite", status: "finalizada", notes: "Cliente espera en sala.", mechanicId: "u-mec1" },
  { id: "w-2", date: "2026-10-05", timeSlot: "09:30", clientName: "Pedro Soto", clientPhone: "+56 9 8765 4321", vehiclePlate: "JKLM56", vehicleLabel: "Nissan Navara 2020", serviceName: "Mantención preventiva 10.000 km", status: "en_proceso", notes: "Revisar frenos traseros.", mechanicId: "u-mec1" },
  { id: "w-3", date: "2026-10-05", timeSlot: "11:00", clientName: "Ana Paredes", clientPhone: "+56 9 1111 2222", vehiclePlate: "QRST78", vehicleLabel: "Kia Frontier 2022", serviceName: "Grúa de plataforma hidráulica", status: "confirmada", notes: "Retiro en Ruta Villarrica – Pucón km 8.", mechanicId: "u-mec2" },
  { id: "w-4", date: "2026-10-05", timeSlot: "14:00", clientName: "Luis Fuentes", clientPhone: "+56 9 3333 4444", vehiclePlate: "UVWX90", vehicleLabel: "Ford F-150 2019", serviceName: "Cambio de neumáticos", status: "solicitada", notes: null, mechanicId: null },
  { id: "w-5", date: "2026-10-06", timeSlot: "09:00", clientName: "Carla Muñoz", clientPhone: "+56 9 5555 6666", vehiclePlate: "EFGH34", vehicleLabel: "Hyundai Accent 2019", serviceName: "Revisión preventiva", status: "solicitada", notes: "Ruido al frenar.", mechanicId: null },
  { id: "w-6", date: "2026-10-06", timeSlot: "15:30", clientName: "Jorge Díaz", clientPhone: "+56 9 7777 8888", vehiclePlate: "IJKL12", vehicleLabel: "Mercedes Actros 2021", serviceName: "Transporte de cargas pesadas", status: "confirmada", notes: "Carga de 12 ton, Villarrica – Temuco.", mechanicId: "u-mec2" },
];

export function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
