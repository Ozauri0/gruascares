import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { clock, weekRange } from "../src/utils/dates.js";
import { makeValidRut } from "../src/utils/rut.js";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

const realNow = clock.now;
afterEach(() => {
  clock.now = realNow;
});

describe("INT-10: semana calendario", () => {
  test("lunes a domingo para cualquier día de la semana", () => {
    // 2026-10-14 es miércoles
    expect(weekRange("2026-10-14")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(weekRange("2026-10-12")).toEqual({ start: "2026-10-12", end: "2026-10-18" }); // lunes
    expect(weekRange("2026-10-18")).toEqual({ start: "2026-10-12", end: "2026-10-18" }); // domingo
    expect(weekRange("2026-10-19")).toEqual({ start: "2026-10-19", end: "2026-10-25" });
  });

  test("cruza meses y años", () => {
    expect(weekRange("2026-12-31")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(weekRange("2026-03-01")).toEqual({ start: "2026-02-23", end: "2026-03-01" });
  });
});

describe.skipIf(!dbReady)("INT-10: GET /api/admin/metrics ampliado", () => {
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

  const metrics = async () => {
    const res = await fetch(`${server.url}/api/admin/metrics`, { headers: cookieFor(seed.admin) });
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  };

  test("semana, vehículos atendidos y agenda de hoy", async () => {
    clock.now = () => new Date("2026-10-14T15:00:00Z"); // miércoles 12:00 en Santiago
    const row = (date: string, slot: string, status: string, service: string) =>
      sql.unsafe(`insert into appointments (user_id, vehicle_id, service_id, scheduled_date, time_slot, status)
        values ('${seed.clientA.id}', ${service === seed.serviceAceite.id ? `'${seed.vehicleA.id}'` : "null"}, '${service}', '${date}', '${slot}', '${status}')`);
    await row("2026-10-12", "10:30", "finalizada", seed.serviceAceite.id); // lunes (semana) - vehículo A atendido
    await row("2026-10-14", "09:30", "confirmada", seed.serviceGrua.id); // hoy
    await row("2026-10-14", "14:00", "solicitada", seed.serviceAceite.id); // hoy
    await row("2026-10-14", "16:00", "cancelada", seed.serviceGrua.id); // hoy, cancelada: no cuenta en la semana
    await row("2026-10-18", "11:30", "solicitada", seed.serviceGrua.id); // domingo (semana)
    await row("2026-10-19", "11:30", "solicitada", seed.serviceGrua.id); // semana siguiente: fuera
    await row("2026-10-05", "11:30", "finalizada", seed.serviceGrua.id); // semana anterior: fuera

    const data = await metrics();
    expect(data.appointments.today.date).toBe("2026-10-14");
    expect(data.appointments.today.total).toBe(3);
    expect(data.appointments.week).toEqual({ start: "2026-10-12", end: "2026-10-18", total: 4, byCategory: { grua: 2, serviteca: 2 } });
    expect(data.vehicles).toEqual({ total: 2, served: 1 });
    expect(data.todayAgenda.map((a: any) => [a.timeSlot, a.status])).toEqual([["09:30", "confirmada"], ["14:00", "solicitada"], ["16:00", "cancelada"]]);
    expect(data.todayAgenda[1]).toMatchObject({ serviceName: "Aceite Test", clientName: "Cliente A", vehiclePlate: "ABCD12" });
    expect(data.users.byRole.usuario).toBe(2);
  });

  test("la agenda de hoy incluye a clientes presenciales sin cuenta", async () => {
    clock.now = () => new Date("2026-10-14T15:00:00Z");
    const [walkIn] = await sql`insert into users (name, rut, phone, role) values ('Presencial Perez', ${makeValidRut(77)}, '+56 9 7777 8888', 'usuario') returning id`;
    await sql`insert into appointments (user_id, service_id, scheduled_date, time_slot) values (${walkIn.id}, ${seed.serviceGrua.id}, '2026-10-14', '09:30')`;
    const data = await metrics();
    expect(data.todayAgenda).toHaveLength(1);
    expect(data.todayAgenda[0]).toMatchObject({ clientName: "Presencial Perez", vehiclePlate: null });
  });

  test("en una base vacía todo es 0 y las listas vacías", async () => {
    const data = await metrics();
    expect(data.appointments.week.total).toBe(0);
    expect(data.vehicles).toEqual({ total: 2, served: 0 });
    expect(data.todayAgenda).toEqual([]);
  });
});
