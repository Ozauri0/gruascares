import { afterEach, describe, expect, test } from "bun:test";
import { toAdminMetrics } from "./api-adapters";
import { ApiError } from "./api";
import { assignWorker, blockDay, blockSlot, bulkBlockDays, bulkUnblockDays, createSlot, deleteSlot, fetchDaySchedule, rescheduleAppointment, fetchAgendaRange, fetchMetrics, listBlockedDays, unblockDay } from "./admin-api";
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

  test("assignWorker asigna al trabajador de la cita", async () => {
    respond(200, { appointment: {} });
    await assignWorker("a 1", "w1");
    expect(calls[0].url).toBe("/api/admin/appointments/a%201/assign");
    expect(calls[0].init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ workerId: "w1" });
  });

  test("fetchAgendaRange pide las dos áreas (es la vista del admin)", async () => {
    respond(200, { total: 0, agenda: [] });
    await fetchAgendaRange("2026-10-01", "2026-10-31");
    expect(calls[0].url).toContain("area=todas");
  });
});

describe("calendario maestro: horarios, bloqueo masivo y cambio de hora", () => {
  const range = { startDate: "2026-10-20", endDate: "2026-12-31", weekdays: [6, 0] };

  test("bloqueo y desbloqueo masivo envían el rango y los días de la semana", async () => {
    respond(201, { created: 12, skipped: 1, affectedAppointments: 2 });
    expect(await bulkBlockDays(range, "Fin de semana")).toEqual({ created: 12, skipped: 1, affectedAppointments: 2 });
    expect(calls[0].url).toBe("/api/admin/blocked-dates/bulk");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ ...range, reason: "Fin de semana" });

    respond(200, { removed: 12 });
    expect(await bulkUnblockDays(range)).toEqual({ removed: 12 });
    expect(calls[1].url).toBe("/api/admin/blocked-dates/bulk-remove");
  });

  test("horarios del día, bloqueo de un bloque y horarios propios", async () => {
    respond(200, { date: "2026-10-20", capacityPerSlot: 2, slots: [{ time: "08:30", custom: false, customId: null, booked: 0, block: null }] });
    expect((await fetchDaySchedule("2026-10-20")).slots).toHaveLength(1);
    expect(calls[0].url).toBe("/api/admin/schedule?date=2026-10-20");

    respond(201, {});
    await blockSlot("2026-10-20", "09:30", "Mantención");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ date: "2026-10-20", timeSlot: "09:30", reason: "Mantención" });
    await createSlot("2026-10-20", "13:00");
    expect(calls[2].url).toBe("/api/admin/time-slots");
    respond(200, {});
    await deleteSlot("s 1");
    expect(calls[3].url).toBe("/api/admin/time-slots/s%201");
    expect(calls[3].init.method).toBe("DELETE");
  });

  test("rescheduleAppointment hace PATCH y propaga el 409 de un horario lleno", async () => {
    respond(200, { notified: true });
    expect(await rescheduleAppointment("a1", "2026-10-21", "15:00")).toEqual({ notified: true });
    expect(calls[0].url).toBe("/api/admin/appointments/a1/reschedule");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ scheduledDate: "2026-10-21", timeSlot: "15:00" });

    respond(409, { error: "Conflict", message: "ya no tiene cupos" });
    expect(((await rescheduleAppointment("a1", "2026-10-21", "15:00").catch((e) => e)) as ApiError).status).toBe(409);
  });
});
