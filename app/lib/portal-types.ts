// Tipos espejo del backend (backend/src/db/schema.ts + backend/src/types/auth.ts).
// Cuando la API esté disponible, estos mismos tipos describen las respuestas reales:
// GET /api/auth/me -> { user: SessionUser }
// GET /api/appointments -> { appointments: PortalAppointment[] }
// GET /api/vehicles -> { vehicles: PortalVehicle[] }

export type UserRole = "admin" | "mecanico" | "usuario";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
};

export type AppointmentStatus =
  | "solicitada"
  | "confirmada"
  | "en_proceso"
  | "finalizada"
  | "cancelada";

export type PortalVehicle = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number | null;
  mileage: number;
};

export type PortalReport = {
  appointmentId: string;
  mechanicName: string;
  observations: string;
  partsReplaced: string | null;
  mileageAtService: number | null;
  recommendations: string | null;
  completedAt: string;
};

export type PortalAppointment = {
  id: string;
  serviceName: string;
  serviceCategory: "grua" | "serviteca";
  vehiclePlate: string;
  vehicleLabel: string;
  scheduledDate: string;
  timeSlot: string;
  status: AppointmentStatus;
  location: string | null;
  notes: string | null;
};
