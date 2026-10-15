import { afterEach, describe, expect, test } from "bun:test";
import { toAdminMetrics } from "./api-adapters";
import { ApiError } from "./api";
import { assignMechanic, blockDay, fetchAgendaRange, fetchMetrics, listBlockedDays, listStaff, unblockDay } from "./admin-api";
import type { ApiAgendaItem, ApiMetrics } from "./api-types";

type Call = { url: string; init: RequestInit };
const realFetch = globalThis.fetch;
let calls: Call[] = [];
function respondWith(handler: (url: string) => { status: number; body?: unknown }) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const { status, body } = handler(url);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}
const respond = (status: number, body?: unknown) => respondWith(() => ({ status, body }));
afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

const metrics: ApiMetrics = {
  appointments: {
    total: 30,
    byStatus: {},
    today: { date: "2026-10-14", total: 3, byStatus: {} },
    week: { start: "2026-10-12", end: "2026-10-18", total: 9, byCategory: { grua: 4, serviteca: 5 } },
  },
  vehicles: { total: 20, served: 12 },
  todayAgenda: [
    { id: "a1", timeSlot: "09:30", status: "confirmada", serviceName: "Mantención", clientName: "María", vehiclePlate: "ABCD12" },
    { id: "a2", timeSlot: "10:30", status: "solicitada", serviceName: "Grúa", clientName: "Invitado", vehiclePlate: null },
  ],
  users: { total: 10, byRole: { admin: 1, mecanico: 2, usuario: 7 }, newClientsLast30Days: 3 },
};

describe("INT-9: métricas del admin", () => {
  test("adapta la respuesta al dashboard", () => {
    const adapted = toAdminMetrics(metrics);
    expect(adapted.appointmentsToday).toBe(3);
    expect(adapted.appointmentsWeek).toBe(9);
    expect(adapted.totalClients).toBe(7);
    expect(adapted.totalVehicles).toBe(12); // atendidos, no registrados
    expect(adapted.byCategory).toEqual([
      { category: "serviteca", label: "Serviteca", count: 5 },
      { category: "grua", label: "Grúas", count: 4 },
    ]);
    expect(adapted.todayAgenda[1]).toMatchObject({ clientName: "Invitado", vehiclePlate: "" });
  });

  test("fetchMetrics llama a /api/admin/metrics", async () => {
    respond(200, metrics);
    expect((await fetchMetrics()).appointmentsWeek).toBe(9);
    expect(calls[0].url).toBe("/api/admin/metrics");
  });
});

describe("INT-9: calendario maestro", () => {
  const item = (id: string): ApiAgendaItem => ({
    id, scheduledDate: "2026-10-20", timeSlot: "09:30", status: "solicitada", location: null, notes: null,
    client: { id: null, name: "X", email: null, phone: null, isGuest: true }, vehicle: null, service: null, report: null,
  });

  test("fetchAgendaRange recorre todas las páginas hasta completar el total", async () => {
    respondWith((url) => {
      const page = Number(new URL(url, "http://x").searchParams.get("page"));
      return { status: 200, body: { total: 3, agenda: page === 1 ? [item("a"), item("b")] : [item("c")] } };
    });
    const all = await fetchAgendaRange("2026-10-01", "2026-10-31");
    expect(all.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("startDate=2026-10-01");
    expect(calls[0].url).toContain("endDate=2026-10-31");
    expect(calls[0].url).toContain("limit=500");
  });

  test("fetchAgendaRange se detiene si una página llega vacía (sin bucle infinito)", async () => {
    respondWith(() => ({ status: 200, body: { total: 99, agenda: [] } }));
    expect(await fetchAgendaRange("2026-10-01", "2026-10-31")).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  test("listBlockedDays solo devuelve bloqueos de día completo", async () => {
    respond(200, {
      blockedDates: [
        { id: "1", date: "2026-10-20", timeSlot: null, reason: "Feriado" },
        { id: "2", date: "2026-10-21", timeSlot: "10:30", reason: "Capacitación" },
      ],
    });
    expect(await listBlockedDays()).toEqual([{ id: "1", date: "2026-10-20", reason: "Feriado" }]);
  });

  test("blockDay / unblockDay", async () => {
    respond(201, { blockedDate: { id: "9", date: "2026-10-20", timeSlot: null, reason: "Feriado" } });
    expect(await blockDay("2026-10-20", "Feriado")).toEqual({ id: "9", date: "2026-10-20", reason: "Feriado" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ date: "2026-10-20", reason: "Feriado" });

    respond(200, { deletedId: "9" });
    await unblockDay("9");
    expect(calls[1].url).toBe("/api/admin/blocked-dates/9");
    expect(calls[1].init.method).toBe("DELETE");
  });

  test("un bloqueo repetido llega como ApiError 409", async () => {
    respond(409, { error: "Conflict", message: "El día 2026-10-20 completo ya se encuentra bloqueado" });
    const error = (await blockDay("2026-10-20", "Otra vez").catch((e) => e)) as ApiError;
    expect(error.status).toBe(409);
  });

  test("listStaff y assignMechanic", async () => {
    respond(200, { staff: [{ id: "m1", name: "Juan", role: "mecanico" }] });
    expect(await listStaff()).toEqual([{ id: "m1", name: "Juan", role: "mecanico" }]);
    expect(calls[0].url).toBe("/api/mechanic/list");

    respond(200, { appointment: {} });
    await assignMechanic("a 1", "m1");
    expect(calls[1].url).toBe("/api/admin/appointments/a%201/assign");
    expect(calls[1].init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ mechanicId: "m1" });
  });
});
