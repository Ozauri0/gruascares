import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
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

describe.skipIf(!dbReady)("INT-7: GET /api/appointments/my", () => {
  test("incluye el informe con el nombre del trabajador, solo de las citas propias", async () => {
    const [done] = await sql`insert into appointments (user_id, vehicle_id, service_id, scheduled_date, time_slot, status)
      values (${seed.clientA.id}, ${seed.vehicleA.id}, ${seed.serviceAceite.id}, '2026-08-20', '10:30', 'finalizada') returning id`;
    await sql`insert into service_records (appointment_id, worker_id, authored_by, observations, mileage_at_service) values (${done.id}, ${seed.mech.id}, ${seed.mechanic.id}, 'Cambio de aceite realizado', 1500)`;
    await sql`insert into appointments (user_id, service_id, scheduled_date, time_slot, status) values (${seed.clientA.id}, ${seed.serviceGrua.id}, ${futureDate()}, '09:30', 'solicitada')`;
    await sql`insert into appointments (user_id, service_id, scheduled_date, time_slot, status) values (${seed.clientB.id}, ${seed.serviceGrua.id}, ${futureDate()}, '10:30', 'solicitada')`;

    const res = await fetch(`${server.url}/api/appointments/my`, { headers: cookieFor(seed.clientA) });
    expect(res.status).toBe(200);
    const { appointments } = (await res.json()) as any;
    expect(appointments).toHaveLength(2); // la del cliente B no aparece

    const finalized = appointments.find((a: any) => a.status === "finalizada");
    expect(finalized.report.mechanicName).toBe("Pedro Taller");
    expect(finalized.report.observations).toBe("Cambio de aceite realizado");
    expect(finalized.vehicle.plate).toBe("ABCD12");

    const pending = appointments.find((a: any) => a.status === "solicitada");
    expect(pending.report).toBeNull();
    expect(pending.vehicle).toBeNull();
  });

  test("sin sesión devuelve 401", async () => {
    expect((await fetch(`${server.url}/api/appointments/my`)).status).toBe(401);
  });
});
