import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "./api";
import { ACTIVE_STATUSES, CANCELLABLE_STATUSES, cancelMyAppointment, listMyAppointments, splitAppointments, type PortalItem } from "./my-appointments-api";

const realFetch = globalThis.fetch;
type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
function respond(status: number, body?: unknown) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

const api = (id: string, date: string, slot: string, status: string, report: unknown = null) => ({
  id,
  scheduledDate: date,
  timeSlot: slot,
  status,
  location: null,
  notes: null,
  service: { id: "s", name: "Cambio de aceite", category: "serviteca" },
  vehicle: { id: "v", plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021 },
  report,
});

describe("INT-7: citas del cliente", () => {
  test("adapta citas e informes (con nombre del mecánico)", async () => {
    respond(200, {
      appointments: [
        api("a1", "2026-08-20", "10:30", "finalizada", { id: "r1", observations: "Trabajo OK", partsReplaced: null, mileageAtService: 1500, recommendations: null, completedAt: "2026-08-20T12:00:00Z", mechanicName: "Juan Paredes" }),
        api("a2", "2026-10-20", "09:30", "solicitada"),
      ],
    });
    const items = await listMyAppointments();
    expect(calls[0].url).toBe("/api/appointments/my");
    expect(items[0].report?.mechanicName).toBe("Juan Paredes");
    expect(items[0].report?.observations).toBe("Trabajo OK");
    expect(items[1].report).toBeNull();
    expect(items[1].appointment.vehicleLabel).toBe("Toyota Hilux 2021");
  });

  test("separa activas (próxima primero) de historial (reciente primero)", () => {
    const mk = (id: string, date: string, slot: string, status: PortalItem["appointment"]["status"]): PortalItem => ({
      appointment: { id, serviceName: "x", serviceCategory: "serviteca", vehiclePlate: "", vehicleLabel: "", scheduledDate: date, timeSlot: slot, status, location: null, notes: null },
      report: null,
    });
    const { active, history } = splitAppointments([
      mk("late", "2026-11-01", "10:30", "confirmada"),
      mk("soon", "2026-10-20", "15:00", "solicitada"),
      mk("soon-am", "2026-10-20", "09:30", "en_proceso"),
      mk("old", "2026-08-01", "10:30", "finalizada"),
      mk("older", "2026-07-01", "10:30", "cancelada"),
    ]);
    expect(active.map((i) => i.appointment.id)).toEqual(["soon-am", "soon", "late"]);
    expect(history.map((i) => i.appointment.id)).toEqual(["old", "older"]);
  });

  test("solo se puede cancelar solicitada o confirmada", () => {
    expect(CANCELLABLE_STATUSES).toEqual(["solicitada", "confirmada"]);
    expect(ACTIVE_STATUSES).toContain("en_proceso");
    expect(CANCELLABLE_STATUSES).not.toContain("en_proceso");
  });

  test("cancelMyAppointment hace PATCH y propaga el 409", async () => {
    respond(200, { appointment: {} });
    await cancelMyAppointment("a 1");
    expect(calls[0].url).toBe("/api/appointments/a%201/cancel");
    expect(calls[0].init.method).toBe("PATCH");

    respond(409, { error: "Conflict", message: "El vehículo ya está en taller: comunícate con Grúas Cares para cancelar" });
    const error = (await cancelMyAppointment("a1").catch((e) => e)) as ApiError;
    expect(error.status).toBe(409);
    expect(error.message).toContain("en taller");
  });
});
