import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MAX_CONCURRENT_APPOINTMENTS_PER_SLOT } from "../src/config/constants.js";
import { sql } from "../src/db/connection.js";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe.skipIf(!dbReady)("ventas y admin se saltan el calendario maestro (#161)", () => {
  let server: TestServer;
  let seed: Seed;
  let date: string;

  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDb();
    seed = await seedBasics();
    date = futureDate();
  });

  type U = Seed["admin"];
  const call = async (user: U | null, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${server.url}${path}`, {
      method,
      headers: user ? cookieFor(user) : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };

  const slotAt = (res: { body: any }, time: string) => res.body.slots.find((s: any) => s.time === time);
  const walkIn = (user: U, extra: Record<string, unknown> = {}) =>
    call(user, "POST", "/api/appointments", {
      serviceId: seed.serviceAceite.id,
      scheduledDate: date,
      timeSlot: "10:30",
      userId: seed.clientA.id,
      vehicleId: seed.vehicleA.id,
      ...extra,
    });

  test("la disponibilidad marca los bloqueos como agendables solo para ventas y admin", async () => {
    await sql`insert into blocked_dates (date, time_slot, reason) values (${date}, '10:30', 'Mantención')`;
    const url = `/api/appointments/availability?date=${date}&ignoreBlocks=true`;

    expect(slotAt(await call(null, "GET", `/api/appointments/availability?date=${date}`), "10:30")).toMatchObject({ available: false, reason: "Mantención" });
    for (const user of [null, seed.clientA, seed.mechanic, seed.crane]) {
      expect(slotAt(await call(user, "GET", url), "10:30")).toMatchObject({ available: false, reason: "Mantención" }); // sin derecho, se ignora el parámetro
    }
    for (const user of [seed.seller, seed.admin]) {
      expect(slotAt(await call(user, "GET", url), "10:30")).toMatchObject({ available: true, blocked: true, reason: "Mantención" });
    }
  });

  test("un día completo bloqueado también se puede agendar desde ventas", async () => {
    await sql`insert into blocked_dates (date, reason) values (${date}, 'Feriado')`;
    const slots = await call(seed.seller, "GET", `/api/appointments/availability?date=${date}&ignoreBlocks=true`);
    expect(slots.body.slots.every((s: any) => s.available && s.blocked)).toBe(true);
    const created = await walkIn(seed.seller, { ignoreBlocks: true });
    expect(created.status).toBe(201);
  });

  test("sin la marca, un bloqueo sigue rechazando incluso a ventas; con ella se agenda y queda registrado", async () => {
    await sql`insert into blocked_dates (date, time_slot, reason) values (${date}, '10:30', 'Mantención')`;
    expect((await walkIn(seed.seller)).status).toBe(409);

    const created = await walkIn(seed.seller, { ignoreBlocks: true });
    expect(created.status).toBe(201);
    let log: any;
    for (let i = 0; i < 40 && !log; i++) { // el registro de actividad se escribe en segundo plano
      [log] = await sql`select details from audit_logs where action = 'APPOINTMENT_CREATE_BY_STAFF'`;
      if (!log) await new Promise((r) => setTimeout(r, 25));
    }
    expect(JSON.parse(log.details)).toMatchObject({ bypassedBlock: "Mantención" });

    const admin = await call(seed.admin, "POST", "/api/appointments", {
      serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "10:30", userId: seed.clientB.id, ignoreBlocks: true,
    });
    expect(admin.status).toBe(201);
  });

  test("cliente, mecánico y grúa no pueden saltarse el calendario", async () => {
    await sql`insert into blocked_dates (date, time_slot, reason) values (${date}, '10:30', 'Mantención')`;
    for (const user of [seed.clientA, seed.mechanic, seed.crane]) {
      const res = await call(user, "POST", "/api/appointments", { serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "10:30", ignoreBlocks: true });
      expect(res.status).toBe(403);
    }
    const [{ count }] = await sql`select count(*)::int as count from appointments`;
    expect(count).toBe(0);
  });

  test("el tope de citas por horario sigue vigente aunque se omita el bloqueo", async () => {
    await sql`insert into blocked_dates (date, time_slot, reason) values (${date}, '10:30', 'Mantención')`;
    for (let i = 0; i < MAX_CONCURRENT_APPOINTMENTS_PER_SLOT; i++) {
      await sql`insert into appointments (user_id, vehicle_id, service_id, scheduled_date, time_slot, status)
        values (${seed.clientB.id}, ${seed.vehicleB.id}, ${seed.serviceAceite.id}, ${date}, '10:30', 'solicitada')`;
    }
    expect((await walkIn(seed.seller, { ignoreBlocks: true })).status).toBe(409);
    expect(slotAt(await call(seed.seller, "GET", `/api/appointments/availability?date=${date}&ignoreBlocks=true`), "10:30")).toMatchObject({ available: false });
  });
});
