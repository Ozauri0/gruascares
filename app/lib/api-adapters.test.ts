import { describe, expect, test } from "bun:test";
import {
  toAgendaItem,
  toPortalAppointment,
  toPortalReport,
  toPortalReportOrNull,
  toPortalVehicle,
  toSessionUser,
  toSlotAvailability,
  vehicleLabel,
} from "./api-adapters";
import type { ApiAgendaItem, ApiMyAppointment } from "./api-types";

const myAppointment: ApiMyAppointment = {
  id: "a1",
  scheduledDate: "2026-10-20",
  timeSlot: "10:30",
  status: "confirmada",
  location: null,
  notes: "Ruido al frenar",
  service: { id: "s1", name: "Cambio de aceite", category: "serviteca" },
  vehicle: { id: "v1", plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021 },
  report: null,
};

describe("INT-1: adaptadores API → UI", () => {
  test("cita del cliente: anidado → plano", () => {
    expect(toPortalAppointment(myAppointment)).toEqual({
      id: "a1",
      serviceName: "Cambio de aceite",
      serviceCategory: "serviteca",
      vehiclePlate: "ABCD12",
      vehicleLabel: "Toyota Hilux 2021",
      scheduledDate: "2026-10-20",
      timeSlot: "10:30",
      status: "confirmada",
      location: null,
      notes: "Ruido al frenar",
    });
  });

  test("cita sin vehículo ni servicio no rompe la vista", () => {
    const adapted = toPortalAppointment({ ...myAppointment, vehicle: null, service: null });
    expect(adapted.vehicleLabel).toBe("Sin vehículo registrado");
    expect(adapted.vehiclePlate).toBe("");
    expect(adapted.serviceName).toBe("Servicio");
  });

  test("vehicleLabel omite el año ausente", () => {
    expect(vehicleLabel({ brand: "Ford", model: "Ranger", year: null })).toBe("Ford Ranger");
    expect(vehicleLabel(null)).toBe("Sin vehículo registrado");
  });

  test("informe: usa el nombre del mecánico si viene, o un nombre por defecto", () => {
    const report = { observations: "Todo OK", partsReplaced: null, mileageAtService: 1000, recommendations: null, completedAt: "2026-10-20T12:00:00Z" };
    expect(toPortalReport("a1", { ...report, mechanic: { id: "m1", name: "Juan" } }).mechanicName).toBe("Juan");
    expect(toPortalReport("a1", report).mechanicName).toBe("Equipo Grúas Cares");
    expect(toPortalReportOrNull(myAppointment)).toBeNull();
    expect(toPortalReportOrNull({ ...myAppointment, report })?.appointmentId).toBe("a1");
  });

  test("vehículo: kilometraje nulo pasa a 0", () => {
    expect(toPortalVehicle({ id: "v", plate: "AB1234", brand: "Kia", model: "Rio", year: null, mileage: null }).mileage).toBe(0);
  });

  test("usuario de sesión completa campos opcionales y soporta perfil sin correo", () => {
    const user = toSessionUser({ id: "u", name: "Ana", email: "a@b.cl", role: "usuario", phone: null });
    expect(user.isActive).toBe(true);
    expect(user.rut).toBe("");
    expect(typeof user.createdAt).toBe("string");

    const walkIn = toSessionUser({ id: "u2", rut: "12345678-5", name: "Pedro", email: null, role: "usuario", phone: "+56 9 1234 5678", hasAccount: false });
    expect(walkIn.rut).toBe("12345678-5");
    expect(walkIn.email).toBe("");
    expect(walkIn.hasAccount).toBe(false);
  });

  test("agenda del taller: cliente invitado y campos nulos", () => {
    const item: ApiAgendaItem = {
      id: "g1",
      scheduledDate: "2026-10-20",
      timeSlot: "09:30",
      status: "solicitada",
      location: null,
      notes: null,
      client: { id: null, name: "Invitado", email: "i@x.cl", phone: null, isGuest: true },
      vehicle: null,
      service: { id: "s", category: "grua", name: "Grúa" },
      report: null,
    };
    expect(toAgendaItem(item)).toEqual({
      id: "g1",
      date: "2026-10-20",
      timeSlot: "09:30",
      clientName: "Invitado",
      clientRut: "",
      clientEmail: "i@x.cl",
      clientPhone: "",
      vehiclePlate: "",
      vehicleLabel: "Sin vehículo registrado",
      serviceName: "Grúa",
      status: "solicitada",
      notes: null,
      mechanicId: null,
      mechanicName: null,
    });
  });

  test("disponibilidad conserva el motivo del bloqueo", () => {
    const slots = toSlotAvailability({
      date: "2026-10-20",
      capacityPerSlot: 2,
      slots: [
        { time: "08:30", bookedCount: 0, capacityRemaining: 2, available: true },
        { time: "09:30", bookedCount: 0, capacityRemaining: 0, available: false, reason: "Feriado" },
      ],
    });
    expect(slots).toEqual([
      { time: "08:30", available: true, reason: undefined },
      { time: "09:30", available: false, reason: "Feriado" },
    ]);
  });
});
