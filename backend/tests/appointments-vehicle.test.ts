import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

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

const book = (headers: Record<string, string>, body: Record<string, unknown>) =>
  fetch(`${server.url}/api/appointments`, { method: "POST", headers, body: JSON.stringify(body) });

describe.skipIf(!dbReady)("SEC-5: el vehículo de la cita debe ser del usuario", () => {
  test("cliente puede agendar con su propio vehículo", async () => {
    const res = await book(cookieFor(seed.clientA), {
      serviceId: seed.serviceAceite.id,
      scheduledDate: futureDate(),
      timeSlot: "10:30",
      vehicleId: seed.vehicleA.id,
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.appointment.vehicleId).toBe(seed.vehicleA.id);
  });

  test("cliente NO puede usar el vehículo de otro usuario", async () => {
    const res = await book(cookieFor(seed.clientA), {
      serviceId: seed.serviceAceite.id,
      scheduledDate: futureDate(),
      timeSlot: "10:30",
      vehicleId: seed.vehicleB.id,
    });
    expect(res.status).toBe(404);
  });

  test("sin sesión no se puede enviar vehicleId", async () => {
    const res = await book(
      { "Content-Type": "application/json" },
      {
        serviceId: seed.serviceAceite.id,
        scheduledDate: futureDate(),
        timeSlot: "10:30",
        vehicleId: seed.vehicleB.id,
        name: "Invitado",
        email: "invitado@test.local",
      }
    );
    expect(res.status).toBe(401);
  });

  test("serviceId y vehicleId inválidos devuelven 400 (no 500)", async () => {
    const headers = cookieFor(seed.clientA);
    const base = { scheduledDate: futureDate(), timeSlot: "10:30" };
    expect((await book(headers, { ...base, serviceId: "no-es-uuid" })).status).toBe(400);
    expect((await book(headers, { ...base, serviceId: seed.serviceAceite.id, vehicleId: "tampoco" })).status).toBe(400);
  });

  test("vehículo inexistente devuelve 404 (no error de FK)", async () => {
    const res = await book(cookieFor(seed.clientA), {
      serviceId: seed.serviceAceite.id,
      scheduledDate: futureDate(),
      timeSlot: "10:30",
      vehicleId: "11111111-1111-4111-8111-111111111111",
    });
    expect(res.status).toBe(404);
  });
});
