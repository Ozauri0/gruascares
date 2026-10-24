import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { CRANE_TRANSFER, cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe.skipIf(!dbReady)("solicitud de grúa con datos del traslado (#141)", () => {
  let server: TestServer;
  let seed: Seed;
  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDb();
    seed = await seedBasics();
  });

  const call = async (user: Seed["admin"], method: string, path: string, body?: unknown) => {
    const res = await fetch(`${server.url}${path}`, { method, headers: cookieFor(user), body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };
  const book = (extra: Record<string, unknown>, slot = "10:30") =>
    call(seed.clientA, "POST", "/api/appointments", { serviceId: seed.serviceGrua.id, scheduledDate: futureDate(), timeSlot: slot, ...extra });

  test("una grúa exige qué se traslada, origen, destino y datos de la carga", async () => {
    expect((await book({})).status).toBe(400);
    expect((await book({ ...CRANE_TRANSFER, cargoType: "avion" })).status).toBe(400);
    expect((await book({ ...CRANE_TRANSFER, location: "" })).status).toBe(400);
    expect((await book({ ...CRANE_TRANSFER, destination: " " })).status).toBe(400);
    expect((await book({ ...CRANE_TRANSFER, cargoDetails: "x" })).status).toBe(400);
    expect((await book({ ...CRANE_TRANSFER, destination: "x".repeat(300) })).status).toBe(400);
  });

  test("puede trasladar un contenedor sin vehículo registrado y los datos llegan al panel de grúas", async () => {
    const created = await book({ cargoType: "contenedor", location: "Puerto seco, Villarrica", destination: "Bodega Pucón", cargoDetails: "Contenedor de 40 pies, 12 toneladas" });
    expect(created.status).toBe(201);
    const [row] = await sql`select vehicle_id, location, cargo_type, destination, cargo_details from appointments where id = ${created.body.appointment.id}`;
    expect(row).toMatchObject({ vehicle_id: null, location: "Puerto seco, Villarrica", cargo_type: "contenedor", destination: "Bodega Pucón", cargo_details: "Contenedor de 40 pies, 12 toneladas" });

    const agenda = await call(seed.crane, "GET", "/api/mechanic/agenda?area=grua");
    expect(agenda.status).toBe(200);
    expect(agenda.body.agenda[0]).toMatchObject({ cargoType: "contenedor", destination: "Bodega Pucón", cargoDetails: "Contenedor de 40 pies, 12 toneladas" });
  });

  test("los servicios de taller no piden ni guardan datos de traslado", async () => {
    const res = await call(seed.clientA, "POST", "/api/appointments", {
      serviceId: seed.serviceAceite.id, scheduledDate: futureDate(), timeSlot: "11:30", vehicleId: seed.vehicleA.id, cargoType: "auto", destination: "Otro lado", cargoDetails: "no aplica",
    });
    expect(res.status).toBe(201);
    const [row] = await sql`select cargo_type, destination, cargo_details from appointments where id = ${res.body.appointment.id}`;
    expect(row).toMatchObject({ cargo_type: null, destination: null, cargo_details: null });
  });
});
