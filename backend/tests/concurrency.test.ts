import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { cookieFor, createClients, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";
import { MAX_CONCURRENT_APPOINTMENTS_PER_SLOT } from "../src/config/constants.js";
import { isUniqueViolation } from "../src/utils/db-errors.js";
import { makeValidRut } from "../src/utils/rut.js";

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

const statuses = (responses: Response[]) => responses.map((r) => r.status).sort();

describe("BUG-5: detección de violaciones únicas", () => {
  test("reconoce 23505 directo o envuelto en cause", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe.skipIf(!dbReady)("BUG-5: reservas simultáneas", () => {
  test("12 solicitudes paralelas al mismo bloque nunca superan la capacidad", async () => {
    const date = futureDate();
    const clients = await createClients(12);
    const responses = await Promise.all(
      clients.map((client) =>
        fetch(`${server.url}/api/appointments`, {
          method: "POST",
          headers: cookieFor(client),
          body: JSON.stringify({ serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "10:30" }),
        })
      )
    );
    const created = responses.filter((r) => r.status === 201).length;
    expect(created).toBe(MAX_CONCURRENT_APPOINTMENTS_PER_SLOT);
    expect(statuses(responses).filter((s) => s === 409)).toHaveLength(12 - MAX_CONCURRENT_APPOINTMENTS_PER_SLOT);
    const [{ n }] = await sql`select count(*)::int as n from appointments where scheduled_date = ${date} and time_slot = '10:30'`;
    expect(n).toBe(MAX_CONCURRENT_APPOINTMENTS_PER_SLOT);
  });

  test("bloques distintos no se bloquean entre sí", async () => {
    const date = futureDate();
    const slots = ["08:30", "09:30", "10:30", "11:30"];
    const clients = await createClients(slots.length);
    const responses = await Promise.all(
      slots.map((timeSlot, i) =>
        fetch(`${server.url}/api/appointments`, {
          method: "POST",
          headers: cookieFor(clients[i]),
          body: JSON.stringify({ serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot }),
        })
      )
    );
    expect(statuses(responses)).toEqual([201, 201, 201, 201]);
  });

  test("registro simultáneo del mismo correo: uno 201 y el resto 409 (no 500)", async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        fetch(`${server.url}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Carrera", rut: makeValidRut(200 + i), phone: "+56 9 3333 4444", email: "carrera@test.local", password: "clave1234" }),
        })
      )
    );
    expect(statuses(responses)).toEqual([201, 409, 409, 409, 409, 409]);
  });

  test("alta simultánea de la misma patente: uno 201 y el resto 409", async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(`${server.url}/api/vehicles`, {
          method: "POST",
          headers: cookieFor(seed.clientB),
          body: JSON.stringify({ plate: "QRST78", brand: "Kia", model: "Frontier" }),
        })
      )
    );
    expect(statuses(responses)).toEqual([201, 409, 409, 409, 409, 409]);
  });

  test("bloqueos simultáneos idénticos: uno 201 y el resto 409", async () => {
    const date = futureDate(10);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${server.url}/api/admin/blocked-dates`, {
          method: "POST",
          headers: cookieFor(seed.admin),
          body: JSON.stringify({ date, reason: "Feriado de prueba" }),
        })
      )
    );
    expect(statuses(responses)).toEqual([201, 409, 409, 409, 409]);
  });
});

describe.skipIf(!dbReady)("solicitudes repetidas de la misma persona", () => {
  const book = (body: Record<string, unknown>, headers: Record<string, string>) =>
    fetch(`${server.url}/api/appointments`, { method: "POST", headers, body: JSON.stringify(body) });

  test("un doble envío con sesión crea una sola cita", async () => {
    const date = futureDate();
    const body = { serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "10:30", vehicleId: seed.vehicleA.id };
    const responses = await Promise.all(Array.from({ length: 4 }, () => book(body, cookieFor(seed.clientA))));
    expect(statuses(responses)).toEqual([201, 409, 409, 409]);
    const [{ n }] = await sql`select count(*)::int as n from appointments where user_id = ${seed.clientA.id}`;
    expect(n).toBe(1);
    // otro horario sí se permite
    expect((await book({ ...body, timeSlot: "11:30" }, cookieFor(seed.clientA))).status).toBe(201);
  });

  test("tras cancelar, la persona puede volver a pedir ese horario", async () => {
    const date = futureDate();
    const body = { serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "10:30" };
    const first = await book(body, cookieFor(seed.clientA));
    const { appointment } = (await first.json()) as any;
    await sql`update appointments set status = 'cancelada' where id = ${appointment.id}`;
    expect((await book(body, cookieFor(seed.clientA))).status).toBe(201);
  });
});

describe.skipIf(!dbReady)("informe técnico enviado dos veces a la vez", () => {
  test("se guarda un solo informe, sin error 500 y con un solo cierre", async () => {
    const [appt] = await sql`insert into appointments (user_id, vehicle_id, service_id, scheduled_date, time_slot, status, mechanic_id)
      values (${seed.clientA.id}, ${seed.vehicleA.id}, ${seed.serviceAceite.id}, ${futureDate()}, '10:30', 'en_proceso', ${seed.mechanic.id}) returning id`;
    const send = () =>
      fetch(`${server.url}/api/mechanic/appointments/${appt.id}/report`, {
        method: "POST",
        headers: cookieFor(seed.mechanic),
        body: JSON.stringify({ observations: "Cambio de aceite realizado", finalize: true }),
      });
    const responses = await Promise.all([send(), send(), send()]);
    expect(responses.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as any[];
    expect(bodies.filter((b) => b.finalized)).toHaveLength(1);
    const [{ n }] = await sql`select count(*)::int as n from service_records where appointment_id = ${appt.id}`;
    expect(n).toBe(1);
  });
});

describe.skipIf(!dbReady)("bloqueos de fecha frente a reservas en curso", () => {
  const settled = async (promise: Promise<unknown>, ms = 400) => {
    let done = false;
    promise.then(() => (done = true), () => (done = true));
    await new Promise((r) => setTimeout(r, ms));
    return done;
  };
  const block = (date: string, timeSlot?: string) =>
    fetch(`${server.url}/api/admin/blocked-dates`, { method: "POST", headers: cookieFor(seed.admin), body: JSON.stringify({ date, timeSlot, reason: "Mantención" }) });
  const book = (date: string, timeSlot: string) =>
    fetch(`${server.url}/api/appointments`, {
      method: "POST",
      headers: cookieFor(seed.clientA),
      body: JSON.stringify({ serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot }),
    });

  test("el bloqueo espera a una reserva en curso del mismo día", async () => {
    const date = futureDate();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const inFlight = sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock_shared(hashtext(${`appointment-day:${date}`}))`; // lo que toma una reserva
      await held;
    });
    await new Promise((r) => setTimeout(r, 100));

    const blocking = block(date, "10:30");
    try {
      expect(await settled(blocking)).toBe(false); // sigue esperando
    } finally {
      release(); // siempre se libera el candado, aunque falle una comprobación (si no, trabaría a las demás pruebas)
    }
    await inFlight;
    expect((await blocking).status).toBe(201);
  });

  test("una reserva espera a un bloqueo en curso y luego lo respeta", async () => {
    const date = futureDate();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const inFlight = sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`appointment-day:${date}`}))`; // lo que toma un bloqueo
      await tx`insert into blocked_dates (date, time_slot, reason) values (${date}, '10:30', 'Mantención')`;
      await held;
    });
    await new Promise((r) => setTimeout(r, 100));

    const booking = book(date, "10:30");
    try {
      expect(await settled(booking)).toBe(false);
    } finally {
      release();
    }
    await inFlight;
    expect((await booking).status).toBe(409); // ya está bloqueado
    const [{ n }] = await sql`select count(*)::int as n from appointments where scheduled_date = ${date}`;
    expect(n).toBe(0);
  });
});
