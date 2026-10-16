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

type U = { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario" | "vendedor"; tokenVersion?: number };
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

describe.skipIf(!dbReady)("bloqueo masivo y cambio de hora", () => {
  const book = (user: U, date: string, timeSlot: string) =>
    call(user, "POST", "/api/appointments", { serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot });

  test("bloquea todos los sábados y domingos de un rango, omite los ya bloqueados y se puede revertir", async () => {
    const start = futureDate(1);
    const end = futureDate(60);
    const weekdays = [0, 6];
    const expected = Array.from({ length: 60 }, (_, i) => futureDate(i + 1)).filter((d) => weekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay()));

    const first = expected[0];
    await call(seed.admin, "POST", "/api/admin/blocked-dates", { date: first, reason: "ya bloqueado" });
    const res = await call(seed.admin, "POST", "/api/admin/blocked-dates/bulk", { startDate: start, endDate: end, weekdays, reason: "Fin de semana" });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(expected.length - 1);
    expect(res.body.skipped).toBe(1);

    const list = await call(seed.admin, "GET", "/api/admin/blocked-dates");
    expect(list.body.blockedDates.map((b: any) => b.date).sort()).toEqual(expected);
    expect((await book(seed.clientA, expected[1], "10:30")).status).toBe(409);

    const undo = await call(seed.admin, "POST", "/api/admin/blocked-dates/bulk-remove", { startDate: start, endDate: end, weekdays });
    expect(undo.body.removed).toBe(expected.length);
    expect((await book(seed.clientA, expected[1], "10:30")).status).toBe(201);
  });

  test("valida el bloqueo masivo", async () => {
    const ok = { startDate: futureDate(1), endDate: futureDate(5), weekdays: [6], reason: "x y z" };
    const post = (b: object) => call(seed.admin, "POST", "/api/admin/blocked-dates/bulk", b);
    expect((await post({ ...ok, weekdays: [] })).status).toBe(400);
    expect((await post({ ...ok, weekdays: [7] })).status).toBe(400);
    expect((await post({ ...ok, endDate: futureDate(0) })).status).toBe(400);
    expect((await post({ ...ok, endDate: futureDate(500) })).status).toBe(400);
    expect((await post({ ...ok, reason: "" })).status).toBe(400);
    expect((await call(seed.mechanic, "POST", "/api/admin/blocked-dates/bulk", ok)).status).toBe(403);
  });

  test("el admin reprograma una cita, se avisa al cliente y se respetan cupos y bloqueos", async () => {
    const date = futureDate(10);
    const other = futureDate(11);
    const id = (await book(seed.clientA, date, "10:30")).body.appointment.id as string;
    const patch = (b: object, user: U = seed.admin) => call(user, "PATCH", `/api/admin/appointments/${id}/reschedule`, b);

    expect((await patch({ scheduledDate: other, timeSlot: "11:30" }, seed.clientA)).status).toBe(403);
    expect((await patch({ scheduledDate: date, timeSlot: "10:30" })).status).toBe(400); // sin cambios
    expect((await patch({ scheduledDate: "2020-01-01", timeSlot: "11:30" })).status).toBe(400);
    expect((await patch({ scheduledDate: other, timeSlot: "04:00" })).status).toBe(400);

    await call(seed.admin, "POST", "/api/admin/blocked-dates", { date: other, timeSlot: "11:30", reason: "bahía en mantención" });
    const blocked = await patch({ scheduledDate: other, timeSlot: "11:30" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain("bahía en mantención");

    await book(seed.clientA, other, "14:00");
    await book(seed.clientB, other, "14:00"); // una misma persona no puede ocupar dos veces el horario
    expect((await patch({ scheduledDate: other, timeSlot: "14:00" })).status).toBe(409); // lleno

    const done = await patch({ scheduledDate: other, timeSlot: "15:00" });
    expect(done.status).toBe(200);
    expect(done.body.appointment.scheduledDate).toBe(other);
    expect(done.body.appointment.timeSlot).toBe("15:00");
    expect(done.body.notified).toBe(true);

    // Liberó su cupo anterior y una cita finalizada o cancelada ya no se mueve.
    expect((await book(seed.clientA, date, "10:30")).status).toBe(201);
    await call(seed.clientA, "PATCH", `/api/appointments/${id}/cancel`);
    expect((await patch({ scheduledDate: other, timeSlot: "16:00" })).status).toBe(409);
  });
});
