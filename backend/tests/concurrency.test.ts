import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";
import { MAX_CONCURRENT_APPOINTMENTS_PER_SLOT } from "../src/config/constants.js";
import { isUniqueViolation } from "../src/utils/db-errors.js";

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
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        fetch(`${server.url}/api/appointments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: seed.serviceAceite.id,
            scheduledDate: date,
            timeSlot: "10:30",
            name: `Invitado ${i}`,
            email: `invitado${i}@test.local`,
          }),
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
    const responses = await Promise.all(
      slots.map((timeSlot, i) =>
        fetch(`${server.url}/api/appointments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot, name: `Inv ${i}`, email: `inv${i}@test.local` }),
        })
      )
    );
    expect(statuses(responses)).toEqual([201, 201, 201, 201]);
  });

  test("registro simultáneo del mismo correo: uno 201 y el resto 409 (no 500)", async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(`${server.url}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Carrera", email: "carrera@test.local", password: "clave1234" }),
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
