import { afterEach, describe, expect, test } from "bun:test";
import { createAppointment, fetchAvailability, listServices } from "./appointments-api";
import type { ApiService } from "./api-types";
import { categoryKey, findServiceByQuery, groupServices, serviceHint, slotStatusLabel } from "./booking";
import { todayInSantiago } from "./dates";

const svc = (id: string, name: string, category: "grua" | "serviteca", min = 60): ApiService => ({
  id,
  name,
  category,
  description: null,
  basePrice: 0,
  estimatedDurationMin: min,
});
const services = [
  svc("1", "Grúa de plataforma hidráulica", "grua"),
  svc("2", "Camiones grúa", "grua"),
  svc("3", "Cambio de aceite y filtro", "serviteca", 45),
];

describe("INT-6: reglas de agendamiento", () => {
  test("agrupa servicios por categoría", () => {
    const groups = groupServices(services);
    expect(groups.gruas.map((s) => s.id)).toEqual(["1", "2"]);
    expect(groups.serviteca.map((s) => s.id)).toEqual(["3"]);
    expect(categoryKey("grua")).toBe("gruas");
    expect(categoryKey("serviteca")).toBe("serviteca");
  });

  test("?servicio= acepta nombre exacto, sin tildes/mayúsculas o parcial", () => {
    expect(findServiceByQuery(services, "Camiones grúa")?.id).toBe("2");
    expect(findServiceByQuery(services, "CAMIONES GRUA")?.id).toBe("2");
    expect(findServiceByQuery(services, "cambio de aceite")?.id).toBe("3");
    expect(findServiceByQuery(services, "Servicio inexistente")).toBeNull();
    expect(findServiceByQuery(services, "")).toBeNull();
    expect(findServiceByQuery(services, null)).toBeNull();
  });

  test("pista de duración según categoría", () => {
    expect(serviceHint(services[0])).toContain("24/7");
    expect(serviceHint(services[2])).toBe("45 min aprox.");
  });

  test("etiquetas de horario", () => {
    expect(slotStatusLabel({ time: "10:30", available: true })).toBe("Disponible");
    expect(slotStatusLabel({ time: "10:30", available: false })).toBe("Ocupado");
    expect(slotStatusLabel({ time: "10:30", available: false, reason: "Horario ya transcurrido" })).toBe("Ya pasó");
    expect(slotStatusLabel({ time: "10:30", available: false, reason: "Feriado" })).toBe("No disponible");
  });

  test("todayInSantiago usa la fecha de Chile, no la UTC", () => {
    expect(todayInSantiago(new Date("2026-10-16T01:00:00Z"))).toBe("2026-10-15");
    expect(todayInSantiago(new Date("2026-06-16T03:30:00Z"))).toBe("2026-06-15");
  });
});

type Call = { url: string; init: RequestInit };
const realFetch = globalThis.fetch;
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

describe("INT-6: cliente de citas", () => {
  test("listServices", async () => {
    respond(200, { services });
    expect((await listServices()).map((s) => s.id)).toEqual(["1", "2", "3"]);
    expect(calls[0].url).toBe("/api/appointments/services");
  });

  test("fetchAvailability pasa la fecha y adapta los bloques", async () => {
    respond(200, {
      date: "2026-10-20",
      capacityPerSlot: 2,
      slots: [
        { time: "08:30", bookedCount: 0, capacityRemaining: 2, available: true },
        { time: "09:30", bookedCount: 2, capacityRemaining: 0, available: false },
      ],
    });
    const slots = await fetchAvailability("2026-10-20");
    expect(calls[0].url).toBe("/api/appointments/availability?date=2026-10-20");
    expect(slots.map((s) => [s.time, s.available])).toEqual([["08:30", true], ["09:30", false]]);
  });

  test("createAppointment omite campos vacíos y devuelve la cita", async () => {
    respond(201, { appointment: { id: "a1", scheduledDate: "2026-10-20", timeSlot: "10:30", status: "solicitada", serviceName: "Camiones grúa" } });
    const created = await createAppointment({ serviceId: "2", scheduledDate: "2026-10-20", timeSlot: "10:30", location: "Calle 1", notes: "", vehicleId: "" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ serviceId: "2", scheduledDate: "2026-10-20", timeSlot: "10:30", location: "Calle 1" });
    expect(created.serviceName).toBe("Camiones grúa");
  });

  test("un 401 al crear lleva a /login y vuelve a /agendar (agendar exige sesión)", async () => {
    const assigned: string[] = [];
    (globalThis as { window?: unknown }).window = { location: { pathname: "/agendar", search: "", assign: (u: string) => assigned.push(u) } };
    respond(401, { error: "Unauthorized", message: "No autenticado: Token no proporcionado" });
    await createAppointment({ serviceId: "2", scheduledDate: "2026-10-20", timeSlot: "10:30" }).catch(() => null);
    expect(assigned).toHaveLength(1);
    expect(assigned[0]).toContain("/login");
    expect(decodeURIComponent(assigned[0])).toContain("/agendar");
    (globalThis as { window?: unknown }).window = undefined;
  });
});
