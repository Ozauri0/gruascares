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
const guestBody = (over: Record<string, unknown> = {}) => ({
  serviceId: "",
  scheduledDate: futureDate(),
  timeSlot: "10:30",
  name: "Invitado Prueba",
  email: "invitado@nuevo.cl",
  phone: "+56 9 1111 2222",
  ...over,
});
const countUsers = async () => Number((await sql`select count(*)::int as n from users`)[0].n);

describe.skipIf(!dbReady)("SEC-6: solicitudes de invitado", () => {
  test("agendar sin sesión con correo nuevo NO crea una cuenta", async () => {
    const before = await countUsers();
    const res = await fetch(`${server.url}/api/appointments`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(guestBody({ serviceId: seed.serviceAceite.id })),
    });
    expect(res.status).toBe(201);
    expect(await countUsers()).toBe(before);
    const [row] = await sql`select user_id, guest_name, guest_email, guest_phone from appointments`;
    expect(row.user_id).toBeNull();
    expect(row.guest_email).toBe("invitado@nuevo.cl");
    expect(row.guest_name).toBe("Invitado Prueba");
  });

  test("agendar con el correo de una cuenta existente NO se asocia a esa cuenta", async () => {
    const res = await fetch(`${server.url}/api/appointments`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(guestBody({ serviceId: seed.serviceAceite.id, email: seed.admin.email })),
    });
    expect(res.status).toBe(201);
    const [row] = await sql`select user_id, guest_email from appointments`;
    expect(row.user_id).toBeNull();
    expect(row.guest_email).toBe(seed.admin.email);

    // el dueño de la cuenta no ve esa solicitud en su historial
    const mine = await fetch(`${server.url}/api/appointments/my`, { headers: cookieFor(seed.admin) });
    expect((await mine.json()).appointments).toHaveLength(0);
  });

  test("correo inválido o nombre ausente devuelve 400", async () => {
    const base = guestBody({ serviceId: seed.serviceAceite.id });
    for (const over of [{ email: "no-es-correo" }, { name: "" }, { email: undefined }]) {
      const res = await fetch(`${server.url}/api/appointments`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...base, ...over }),
      });
      expect(res.status).toBe(400);
    }
  });

  test("al registrarse con el mismo correo, sus solicitudes de invitado se vinculan", async () => {
    await fetch(`${server.url}/api/appointments`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(guestBody({ serviceId: seed.serviceAceite.id, email: "Nuevo.Cliente@Test.cl" })),
    });
    const reg = await fetch(`${server.url}/api/auth/register`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Nuevo Cliente", email: "nuevo.cliente@test.cl", password: "clave1234" }),
    });
    expect(reg.status).toBe(201);
    const { user } = await reg.json();
    const token = /gc_token=([^;]+)/.exec(reg.headers.get("set-cookie") ?? "")?.[1];

    const [row] = await sql`select user_id, guest_email, guest_name from appointments`;
    expect(row.user_id).toBe(user.id);
    expect(row.guest_email).toBeNull();

    const mine = await fetch(`${server.url}/api/appointments/my`, { headers: { Cookie: `gc_token=${token}` } });
    expect((await mine.json()).appointments).toHaveLength(1);
  });

  test("el mecánico ve los datos de contacto del invitado en la agenda", async () => {
    const date = futureDate();
    await fetch(`${server.url}/api/appointments`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(guestBody({ serviceId: seed.serviceAceite.id, scheduledDate: date })),
    });
    const res = await fetch(`${server.url}/api/mechanic/agenda?date=${date}`, { headers: cookieFor(seed.mechanic) });
    const { agenda } = await res.json();
    expect(agenda).toHaveLength(1);
    expect(agenda[0].client.name).toBe("Invitado Prueba");
    expect(agenda[0].client.email).toBe("invitado@nuevo.cl");
    expect(agenda[0].client.isGuest).toBe(true);
  });

  test("la BD rechaza citas sin titular (ni cuenta ni correo de invitado)", async () => {
    let failed = false;
    try {
      await sql`insert into appointments (service_id, scheduled_date, time_slot) values (${seed.serviceAceite.id}, '2030-01-01', '10:30')`;
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});
