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

const JSON_HEADERS = { "Content-Type": "application/json" };
const countUsers = async () => Number((await sql`select count(*)::int as n from users`)[0].n);
const request = (over: Record<string, unknown> = {}) => ({
  serviceId: seed.serviceAceite.id,
  scheduledDate: futureDate(),
  timeSlot: "10:30",
  name: "Invitado Prueba",
  email: "invitado@nuevo.cl",
  phone: "+56 9 1111 2222",
  ...over,
});

describe.skipIf(!dbReady)("agendar exige iniciar sesión y user_id obligatorio", () => {
  test("sin sesión responde 401: no crea cuenta ni cita, ni siquiera con datos de contacto completos", async () => {
    const before = await countUsers();
    const res = await fetch(`${server.url}/api/appointments`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(request()) });
    expect(res.status).toBe(401);
    expect(await countUsers()).toBe(before);
    expect((await sql`select 1 from appointments`).length).toBe(0);
  });

  test("con sesión se agenda a nombre de la cuenta, ignorando nombre y correo enviados en el cuerpo", async () => {
    const res = await fetch(`${server.url}/api/appointments`, {
      method: "POST",
      headers: cookieFor(seed.clientA),
      body: JSON.stringify(request({ email: "otro@nuevo.cl", name: "Otra Persona" })),
    });
    expect(res.status).toBe(201);
    const [row] = await sql`select user_id from appointments`;
    expect(row.user_id).toBe(seed.clientA.id);
  });

  test("la BD rechaza citas sin titular (user_id es NOT NULL)", async () => {
    let failed = false;
    try {
      await sql`insert into appointments (service_id, scheduled_date, time_slot) values (${seed.serviceAceite.id}, '2030-01-01', '10:30')`;
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  test("las columnas guest_* ya no existen en appointments", async () => {
    const cols = await sql`select column_name from information_schema.columns where table_name = 'appointments' and column_name like 'guest_%'`;
    expect(cols).toHaveLength(0);
  });
});
