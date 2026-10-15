import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

/** Horarios propios por día y bloqueo de bloques concretos desde el calendario maestro. */
let server: TestServer;
let seed: Seed;
beforeAll(async () => {
  if (dbReady) server = await startServer();
});
afterAll(async () => {
  if (server) await server.close();
});
beforeEach(async () => {
  if (!dbReady) return;
  await resetDb();
  seed = await seedBasics();
});

type U = { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario"; tokenVersion?: number };
const call = async (user: U | null, method: string, path: string, body?: unknown) => {
  const headers = user ? cookieFor(user) : { "Content-Type": "application/json" };
  const res = await fetch(`${server.url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};

describe.skipIf(!dbReady)("horarios por día", () => {
  test("solo el admin gestiona horarios", async () => {
    const date = futureDate(8);
    expect((await call(seed.mechanic, "POST", "/api/admin/time-slots", { date, timeSlot: "13:00" })).status).toBe(403);
    expect((await call(null, "GET", `/api/admin/schedule?date=${date}`)).status).toBe(401);
  });

  test("un horario creado aparece en la disponibilidad, admite citas y solo existe ese día", async () => {
    const date = futureDate(8);
    const created = await call(seed.admin, "POST", "/api/admin/time-slots", { date, timeSlot: "13:00" });
    expect(created.status).toBe(201);

    const avail = await call(null, "GET", `/api/appointments/availability?date=${date}`);
    const times = avail.body.slots.map((s: any) => s.time);
    expect(times).toContain("13:00");
    expect(times).toEqual([...times].sort());
    const other = await call(null, "GET", `/api/appointments/availability?date=${futureDate(9)}`);
    expect(other.body.slots.map((s: any) => s.time)).not.toContain("13:00");

    const body = { serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "13:00" };
    expect((await call(seed.clientA, "POST", "/api/appointments", body)).status).toBe(201);
    expect((await call(seed.clientA, "POST", "/api/appointments", { ...body, scheduledDate: futureDate(9) })).status).toBe(400);
  });

  test("valida formato, duplicados y fechas pasadas", async () => {
    const date = futureDate(8);
    expect((await call(seed.admin, "POST", "/api/admin/time-slots", { date, timeSlot: "25:00" })).status).toBe(400);
    expect((await call(seed.admin, "POST", "/api/admin/time-slots", { date, timeSlot: "03:00" })).status).toBe(400);
    expect((await call(seed.admin, "POST", "/api/admin/time-slots", { date, timeSlot: "08:30" })).status).toBe(409); // predefinido
    expect((await call(seed.admin, "POST", "/api/admin/time-slots", { date, timeSlot: "13:00" })).status).toBe(201);
    expect((await call(seed.admin, "POST", "/api/admin/time-slots", { date, timeSlot: "13:00" })).status).toBe(409);
    expect((await call(seed.admin, "POST", "/api/admin/time-slots", { date: "2020-01-01", timeSlot: "13:00" })).status).toBe(400);
  });

  test("bloquear un bloque concreto impide agendarlo; desbloquear lo reabre", async () => {
    const date = futureDate(8);
    const block = await call(seed.admin, "POST", "/api/admin/blocked-dates", { date, timeSlot: "10:30", reason: "Mantención de bahía" });
    expect(block.status).toBe(201);
    expect((await call(seed.admin, "POST", "/api/admin/blocked-dates", { date, timeSlot: "04:15", reason: "no existe" })).status).toBe(400);

    const schedule = await call(seed.admin, "GET", `/api/admin/schedule?date=${date}`);
    const slot = schedule.body.slots.find((s: any) => s.time === "10:30");
    expect(slot.block.reason).toBe("Mantención de bahía");

    const body = { serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "10:30" };
    expect((await call(seed.clientA, "POST", "/api/appointments", body)).status).toBe(409);
    expect((await call(seed.admin, "DELETE", `/api/admin/blocked-dates/${slot.block.id}`)).status).toBe(200);
    expect((await call(seed.clientA, "POST", "/api/appointments", body)).status).toBe(201);
  });

  test("eliminar un horario: se niega con citas activas y limpia sus bloqueos", async () => {
    const date = futureDate(8);
    const created = await call(seed.admin, "POST", "/api/admin/time-slots", { date, timeSlot: "13:00" });
    const id = created.body.timeSlot.id as string;
    const booked = await call(seed.clientA, "POST", "/api/appointments", { serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "13:00" });
    expect((await call(seed.admin, "DELETE", `/api/admin/time-slots/${id}`)).status).toBe(409);

    await call(seed.clientA, "PATCH", `/api/appointments/${booked.body.appointment.id}/cancel`);
    await call(seed.admin, "POST", "/api/admin/blocked-dates", { date, timeSlot: "13:00", reason: "prueba" });
    expect((await call(seed.admin, "DELETE", `/api/admin/time-slots/${id}`)).status).toBe(200);
    const schedule = await call(seed.admin, "GET", `/api/admin/schedule?date=${date}`);
    expect(schedule.body.slots.map((s: any) => s.time)).not.toContain("13:00");
    const list = await call(seed.admin, "GET", "/api/admin/blocked-dates");
    expect(list.body.blockedDates.filter((b: any) => b.timeSlot === "13:00")).toHaveLength(0);
  });
});
