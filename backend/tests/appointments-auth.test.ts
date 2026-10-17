import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { testOutbox } from "../src/services/email/email.service.js";
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
/** Solicitud de invitado "histórica" (hechas antes de exigir sesión): se inserta directo en la base. */
const insertGuestAppointment = (email: string, date: string = futureDate()) =>
  sql`insert into appointments (service_id, scheduled_date, time_slot, guest_name, guest_email, guest_phone)
      values (${seed.serviceAceite.id}, ${date}, '10:30', 'Invitado Prueba', ${email}, '+56 9 1111 2222')`;

describe.skipIf(!dbReady)("agendar exige iniciar sesión", () => {
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
    const [row] = await sql`select user_id, guest_email, guest_name from appointments`;
    expect(row.user_id).toBe(seed.clientA.id);
    expect(row.guest_email).toBeNull();
    expect(row.guest_name).toBeNull();
  });
});

describe.skipIf(!dbReady)("solicitudes de invitado anteriores", () => {
  test("al confirmar el correo de la cuenta nueva se vinculan; antes de confirmar no", async () => {
    await insertGuestAppointment("Nuevo.Cliente@Test.cl");
    const reg = await fetch(`${server.url}/api/auth/register`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Nuevo Cliente", email: "nuevo.cliente@test.cl", password: "clave1234" }),
    });
    expect(reg.status).toBe(201);
    const { user } = (await reg.json()) as any;

    // Sin confirmar el correo no se vincula nada (nadie puede apropiarse de solicitudes ajenas).
    const [pending] = await sql`select user_id from appointments`;
    expect(pending.user_id).toBeNull();

    const link = testOutbox.at(-1)!.html.match(/confirmar-correo\?token=([^"&\s<]+)/)![1];
    const verify = await fetch(`${server.url}/api/auth/verify-email`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ token: decodeURIComponent(link) }) });
    expect(verify.status).toBe(200);
    const login = await fetch(`${server.url}/api/auth/login`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ email: "nuevo.cliente@test.cl", password: "clave1234" }) });
    expect(login.status).toBe(200);
    const token = /gc_token=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];

    const [row] = await sql`select user_id, guest_email, guest_name from appointments`;
    expect(row.user_id).toBe(user.id);
    expect(row.guest_email).toBeNull();

    const mine = await fetch(`${server.url}/api/appointments/my`, { headers: { Cookie: `gc_token=${token}` } });
    expect(((await mine.json()) as any).appointments).toHaveLength(1);
  });

  test("una cuenta existente no recibe solicitudes de invitado de su mismo correo", async () => {
    await insertGuestAppointment(seed.admin.email);
    const mine = await fetch(`${server.url}/api/appointments/my`, { headers: cookieFor(seed.admin) });
    expect(((await mine.json()) as any).appointments).toHaveLength(0);
  });

  test("el mecánico ve los datos de contacto del invitado en la agenda", async () => {
    const date = futureDate();
    await insertGuestAppointment("invitado@nuevo.cl", date);
    const res = await fetch(`${server.url}/api/mechanic/agenda?date=${date}`, { headers: cookieFor(seed.mechanic) });
    const { agenda } = (await res.json()) as any;
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
