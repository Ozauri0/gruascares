import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { makeValidRut } from "../src/utils/rut.js";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe.skipIf(!dbReady)("trabajadores sin cuenta (#130)", () => {
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

  type U = Seed["admin"];
  const call = async (user: U | null, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${server.url}${path}`, {
      method,
      headers: user ? cookieFor(user) : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };
  const names = (r: { body: any }) => r.body.workers.map((w: any) => w.name).sort();

  test("cada jefe ve a los trabajadores de su área y el admin a todos", async () => {
    expect(names(await call(seed.mechanic, "GET", "/api/workers"))).toEqual(["Camilo Mixto", "Pedro Taller"]);
    expect(names(await call(seed.crane, "GET", "/api/workers"))).toEqual(["Camilo Mixto", "Jorge Gruero"]);
    expect(names(await call(seed.admin, "GET", "/api/workers"))).toEqual(["Camilo Mixto", "Jorge Gruero", "Pedro Taller"]);
    expect(names(await call(seed.admin, "GET", "/api/workers?area=grua"))).toEqual(["Camilo Mixto", "Jorge Gruero"]);
    expect((await call(seed.mechanic, "GET", "/api/workers?area=grua")).status).toBe(403);
    expect((await call(seed.crane, "GET", "/api/workers?area=otra")).status).toBe(400);
  });

  test("solo los jefes de área y el admin gestionan trabajadores", async () => {
    expect((await call(null, "GET", "/api/workers")).status).toBe(401);
    expect((await call(seed.clientA, "GET", "/api/workers")).status).toBe(403);
    expect((await call(seed.seller, "GET", "/api/workers")).status).toBe(403);
    expect((await call(seed.seller, "POST", "/api/workers", { name: "X Y", rut: makeValidRut(40), types: ["mecanico"] })).status).toBe(403);
  });

  test("el jefe de taller registra mecánicos con RUT válido y único, y no grueros", async () => {
    const rut = makeValidRut(41);
    const created = await call(seed.mechanic, "POST", "/api/workers", { name: "  Ana Soto  ", rut, phone: "+56 9 4444 0041", types: ["mecanico"] });
    expect(created.status).toBe(201);
    expect(created.body.worker).toMatchObject({ name: "Ana Soto", types: ["mecanico"], isActive: true });
    expect(created.body.worker.rut).toBe(rut);

    expect((await call(seed.mechanic, "POST", "/api/workers", { name: "Otra Ana", rut, types: ["mecanico"] })).status).toBe(409); // RUT repetido
    expect((await call(seed.mechanic, "POST", "/api/workers", { name: "Sin RUT", rut: "12345678-0", types: ["mecanico"] })).status).toBe(400);
    expect((await call(seed.mechanic, "POST", "/api/workers", { name: "A", rut: makeValidRut(42), types: ["mecanico"] })).status).toBe(400);
    expect((await call(seed.mechanic, "POST", "/api/workers", { name: "Sin tipo", rut: makeValidRut(43), types: [] })).status).toBe(400);
    expect((await call(seed.mechanic, "POST", "/api/workers", { name: "Gruero Nuevo", rut: makeValidRut(44), types: ["gruero"] })).status).toBe(403);
    expect((await call(seed.mechanic, "POST", "/api/workers", { name: "Mixto Nuevo", rut: makeValidRut(45), types: ["mecanico", "gruero"] })).status).toBe(403);
    expect((await call(seed.admin, "POST", "/api/workers", { name: "Mixto Admin", rut: makeValidRut(45), types: ["mecanico", "gruero"] })).status).toBe(201);
  });

  test("editar, desactivar y reactivar: cada jefe solo toca su área y conserva los tipos ajenos", async () => {
    // El jefe de taller edita a Camilo (mecánico y gruero): solo cambia lo suyo y se conserva «gruero».
    const edited = await call(seed.mechanic, "PATCH", `/api/workers/${seed.both.id}`, { phone: "+56 9 4444 0099", types: ["mecanico"] });
    expect(edited.status).toBe(200);
    expect(edited.body.worker.types.sort()).toEqual(["gruero", "mecanico"]);
    // Le quita mecánico (lo suyo): queda solo gruero y ya no lo ve el jefe de taller.
    const dropped = await call(seed.admin, "PATCH", `/api/workers/${seed.both.id}`, { types: ["gruero"] });
    expect(dropped.body.worker.types).toEqual(["gruero"]);
    expect((await call(seed.mechanic, "PATCH", `/api/workers/${seed.both.id}`, { name: "Intruso" })).status).toBe(404);
    expect((await call(seed.mechanic, "PATCH", `/api/workers/${seed.rigger.id}`, { isActive: false })).status).toBe(404);

    expect((await call(seed.mechanic, "PATCH", `/api/workers/${seed.mech.id}`, { isActive: false })).status).toBe(200);
    expect(names(await call(seed.mechanic, "GET", "/api/workers?active=true"))).toEqual([]);
    expect(names(await call(seed.mechanic, "GET", "/api/workers?active=false"))).toEqual(["Pedro Taller"]);
    expect((await call(seed.mechanic, "PATCH", `/api/workers/${seed.mech.id}`, { isActive: true })).status).toBe(200);
    expect((await call(seed.mechanic, "PATCH", `/api/workers/${seed.mech.id}`, { rut: makeValidRut(22) })).status).toBe(409); // RUT de otro trabajador
    expect((await call(seed.mechanic, "PATCH", `/api/workers/${seed.mech.id}`, {})).status).toBe(400);
    expect((await call(seed.mechanic, "PATCH", `/api/workers/${seed.mech.id}`, { types: ["gruero"] })).status).toBe(403);
    expect((await call(seed.mechanic, "PATCH", "/api/workers/no-uuid", { name: "Algo" })).status).toBe(400);
  });

  test("desactivar no rompe el historial: el trabajador sigue en las citas e informes", async () => {
    const [appt] = await sql`insert into appointments (user_id, service_id, scheduled_date, time_slot, status, worker_id)
      values (${seed.clientA.id}, ${seed.serviceAceite.id}, '2030-02-01', '10:30', 'finalizada', ${seed.mech.id}) returning id`;
    await sql`insert into service_records (appointment_id, worker_id, authored_by, observations) values (${appt.id}, ${seed.mech.id}, ${seed.mechanic.id}, 'Trabajo hecho')`;
    expect((await call(seed.mechanic, "PATCH", `/api/workers/${seed.mech.id}`, { isActive: false })).status).toBe(200);
    const agenda = await call(seed.mechanic, "GET", "/api/mechanic/agenda?date=2030-02-01");
    expect(agenda.body.agenda[0]).toMatchObject({ workerId: seed.mech.id, workerName: "Pedro Taller" });
    const report = await call(seed.clientA, "GET", `/api/mechanic/appointments/${appt.id}/report`);
    expect(report.body.report.worker).toEqual({ id: seed.mech.id, name: "Pedro Taller" });
  });

  test("las altas, cambios y bajas quedan en el registro de actividad (área taller)", async () => {
    const created = await call(seed.mechanic, "POST", "/api/workers", { name: "Ana Soto", rut: makeValidRut(41), types: ["mecanico"] });
    await call(seed.mechanic, "PATCH", `/api/workers/${created.body.worker.id}`, { isActive: false });
    for (let i = 0; i < 40; i++) {
      const rows = await sql`select action from audit_logs where action like 'WORKER_%' order by created_at`;
      if (rows.length >= 2) {
        expect(rows.map((r) => r.action)).toEqual(["WORKER_CREATED", "WORKER_DEACTIVATED"]);
        const log = await call(seed.admin, "GET", "/api/admin/audit-logs?area=taller");
        expect(log.body.logs.map((l: any) => l.action)).toContain("WORKER_DEACTIVATED");
        return;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("faltan eventos WORKER_*");
  });
});
