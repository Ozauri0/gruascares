import type { PortalAppointment, PortalReport, PortalVehicle, SessionUser } from "./portal-types";

// Datos demostrativos del portal. Reemplazar por fetch a la API real:
// - GET /api/auth/me (cookie httpOnly `gc_token`)
// - GET /api/appointments?mine=true
// - GET /api/vehicles
// - GET /api/appointments/:id/report (service_records)

export const MOCK_REPORTS: PortalReport[] = [
  {
    appointmentId: "a-3",
    mechanicName: "Taller Grúas Cares",
    observations: "Se reemplazaron pastillas delanteras y se rectificaron discos. Nivel de líquido de frenos correcto.",
    partsReplaced: "Pastillas de freno delanteras (juego), líquido de frenos DOT4.",
    mileageAtService: 84210,
    recommendations: "Revisar pastillas traseras en la próxima mantención (vida útil estimada 8.000 km).",
    completedAt: "2026-08-20T12:30:00.000Z",
  },
];

export const MOCK_USER: SessionUser = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "María González",
  email: "maria.gonzalez@ejemplo.cl",
  role: "usuario",
  phone: "+56 9 1234 5678",
  isActive: true,
  createdAt: "2026-09-14T12:00:00.000Z",
};

export const MOCK_VEHICLES: PortalVehicle[] = [
  { id: "v-1", plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021, mileage: 84500 },
  { id: "v-2", plate: "EFGH34", brand: "Hyundai", model: "Accent", year: 2019, mileage: 112300 },
];

export const MOCK_APPOINTMENTS: PortalAppointment[] = [
  {
    id: "a-1",
    serviceName: "Mantención preventiva 10.000 km",
    serviceCategory: "serviteca",
    vehiclePlate: "ABCD12",
    vehicleLabel: "Toyota Hilux 2021",
    scheduledDate: "2026-10-07",
    timeSlot: "09:00",
    status: "confirmada",
    location: "Taller Villarrica",
    notes: "Incluye cambio de aceite y filtros.",
  },
  {
    id: "a-2",
    serviceName: "Grúa de plataforma hidráulica",
    serviceCategory: "grua",
    vehiclePlate: "EFGH34",
    vehicleLabel: "Hyundai Accent 2019",
    scheduledDate: "2026-10-09",
    timeSlot: "15:30",
    status: "solicitada",
    location: "Ruta Villarrica – Pucón",
    notes: "Traslado por panne eléctrica.",
  },
  {
    id: "a-3",
    serviceName: "Cambio de pastillas de freno",
    serviceCategory: "serviteca",
    vehiclePlate: "ABCD12",
    vehicleLabel: "Toyota Hilux 2021",
    scheduledDate: "2026-08-20",
    timeSlot: "10:00",
    status: "finalizada",
    location: "Taller Villarrica",
    notes: null,
  },
];
