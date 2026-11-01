import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe.skipIf(!dbReady)("flota de grúas y gruero a cargo (#160)", () => {
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
  const create = (extra: Record<string, unknown> = {}) =>
    call(seed.crane, "POST", "/api/cranes", { name: "Grúa 1", plate: "ab-cd12", type: "plataforma", ...extra });

  test("solo el jefe de grúas y el admin gestionan la flota", async () => {
    for (const user of [null, seed.clientA, seed.mechanic, seed.seller]) {
      expect((await call(user, "GET", "/api/cranes")).status).toBe(user ? 403 : 401);
      expect((await call(user, "POST", "/api/cranes", { name: "X", plate: "ABCD12" })).status).toBe(user ? 403 : 401);
    }
    expect((await call(seed.crane, "GET", "/api/cranes")).status).toBe(200);
    expect((await call(seed.admin, "GET", "/api/cranes")).status).toBe(200);
  });

  test("registra una grúa con patente normalizada y gruero a cargo", async () => {
    const res = await create({ workerId: seed.rigger.id });
    expect(res.status).toBe(201);
    expect(res.body.crane).toMatchObject({ name: "Grúa 1", plate: "ABCD12", type: "plataforma", isActive: true, workerId: seed.rigger.id, workerName: seed.rigger.name });

    const list = await call(seed.admin, "GET", "/api/cranes");
    expect(list.body.cranes).toHaveLength(1);
    expect((await create()).status).toBe(409); // la patente es única
  });

  test("valida los datos de entrada", async () => {
    expect((await create({ name: "A" })).status).toBe(400);
    expect((await create({ plate: "123" })).status).toBe(400);
    expect((await create({ type: "helicoptero" })).status).toBe(400);
    expect((await create({ workerId: "no-es-uuid" })).status).toBe(400);
    expect((await call(seed.crane, "PATCH", "/api/cranes/no-es-uuid", { name: "X" })).status).toBe(400);
    expect((await call(seed.crane, "PATCH", "/api/cranes/00000000-0000-4000-8000-000000000000", { name: "Otro" })).status).toBe(404);
    const ok = await create();
    expect((await call(seed.crane, "PATCH", `/api/cranes/${ok.body.crane.id}`, {})).status).toBe(400);
  });

  test("solo un gruero activo puede quedar a cargo; se puede cambiar y quitar", async () => {
    const id = (await create()).body.crane.id as string;
    const patch = (body: unknown) => call(seed.crane, "PATCH", `/api/cranes/${id}`, body);

    expect((await patch({ workerId: seed.mech.id })).status).toBe(400); // un mecánico no es gruero
    await sql`update workers set is_active = false where id = ${seed.both.id}`;
    expect((await patch({ workerId: seed.both.id })).status).toBe(400); // inactivo

    expect((await patch({ workerId: seed.rigger.id })).body.crane.workerId).toBe(seed.rigger.id);
    await sql`update workers set is_active = true where id = ${seed.both.id}`;
    expect((await patch({ workerId: seed.both.id })).body.crane.workerName).toBe(seed.both.name); // quien es mecánico y gruero sirve
    expect((await patch({ workerId: null })).body.crane.workerId).toBeNull();
  });

  test("dar de baja conserva la grúa y los cambios quedan en el registro de actividad", async () => {
    const id = (await create()).body.crane.id as string;
    expect((await call(seed.admin, "PATCH", `/api/cranes/${id}`, { workerId: seed.rigger.id })).status).toBe(200);
    expect((await call(seed.admin, "PATCH", `/api/cranes/${id}`, { isActive: false, notes: "En reparación" })).body.crane).toMatchObject({ isActive: false, notes: "En reparación" });

    expect((await call(seed.crane, "GET", "/api/cranes?active=true")).body.cranes).toHaveLength(0);
    expect((await call(seed.crane, "GET", "/api/cranes?active=false")).body.cranes).toHaveLength(1);

    let actions: string[] = [];
    for (let i = 0; i < 40 && actions.length < 3; i++) { // el registro se escribe en segundo plano
      actions = (await sql`select action from audit_logs where action like 'CRANE_%'`).map((r) => r.action as string);
      if (actions.length < 3) await new Promise((r) => setTimeout(r, 25));
    }
    expect(actions.sort()).toEqual(["CRANE_ASSIGNED", "CRANE_CREATED", "CRANE_DEACTIVATED"]);
  });

  test("al borrar al trabajador la grúa queda sin gruero", async () => {
    const id = (await create({ workerId: seed.rigger.id })).body.crane.id as string;
    await sql`delete from workers where id = ${seed.rigger.id}`;
    expect((await call(seed.crane, "GET", "/api/cranes")).body.cranes.find((c: any) => c.id === id).workerId).toBeNull();
  });

  describe("grúa y gruero por servicio", () => {
    const insertCrane = async (plate = "ABCD12", workerId: string | null = null, active = true) => {
      const [row] = await sql`insert into cranes (name, plate, worker_id, is_active) values (${"Grúa " + plate}, ${plate}, ${workerId}, ${active}) returning id`;
      return row.id as string;
    };
    const insertService = async (serviceId = seed.serviceGrua.id) => {
      const [row] = await sql`insert into appointments (user_id, vehicle_id, service_id, scheduled_date, time_slot, status)
        values (${seed.clientA.id}, ${seed.vehicleA.id}, ${serviceId}, '2030-01-10', '10:30', 'confirmada') returning id`;
      return row.id as string;
    };
    const assign = (id: string, body: unknown, user: U = seed.crane) => call(user, "PATCH", `/api/mechanic/appointments/${id}/assign`, body);

    test("se asigna la grúa y el gruero a un servicio y la agenda los muestra", async () => {
      const id = await insertService();
      const craneId = await insertCrane("ABCD12");
      expect((await assign(id, { workerId: seed.rigger.id, craneId })).status).toBe(200);

      const agenda = await call(seed.crane, "GET", "/api/mechanic/agenda?area=grua");
      expect(agenda.body.agenda[0]).toMatchObject({ id, workerId: seed.rigger.id, craneId, craneName: "Grúa ABCD12", cranePlate: "ABCD12" });
      expect((await assign(id, { craneId: null })).status).toBe(200); // quitar la grúa
      expect((await call(seed.crane, "GET", "/api/mechanic/agenda?area=grua")).body.agenda[0].craneId).toBeNull();
    });

    test("al elegir una grúa con gruero fijo, queda también a cargo si la cita no tenía trabajador", async () => {
      const id = await insertService();
      const craneId = await insertCrane("ABCD12", seed.rigger.id);
      const res = await assign(id, { craneId });
      expect(res.status).toBe(200);
      expect(res.body.worker).toMatchObject({ id: seed.rigger.id });

      const other = await insertService();
      await assign(other, { workerId: seed.both.id });
      expect((await assign(other, { craneId })).body.worker).toBeNull(); // ya había uno: no se pisa
      const [row] = await sql`select worker_id from appointments where id = ${other}`;
      expect(row.worker_id).toBe(seed.both.id);
    });

    test("rechaza grúas inexistentes o de baja, y grúa en servicios de taller", async () => {
      const id = await insertService();
      expect((await assign(id, { craneId: "00000000-0000-4000-8000-000000000000" })).status).toBe(400);
      expect((await assign(id, { craneId: await insertCrane("WXYZ99", null, false) })).status).toBe(400);
      expect((await assign(id, {})).status).toBe(400);
      expect((await assign(id, { craneId: "no-uuid" })).status).toBe(400);

      const taller = await insertService(seed.serviceAceite.id);
      expect((await assign(taller, { craneId: await insertCrane("EFGH34") }, seed.mechanic)).status).toBe(400);
      expect((await assign(id, { craneId: await insertCrane("JKLM56") }, seed.mechanic)).status).toBe(403); // el jefe de taller no gestiona grúas
    });

    test("iniciar un servicio de grúa exige gruero y grúa; también se pueden mandar al cambiar el estado", async () => {
      const id = await insertService();
      const status = (body: Record<string, unknown>) => call(seed.crane, "PATCH", `/api/mechanic/appointments/${id}/status`, { status: "en_proceso", ...body });
      expect((await status({ workerId: seed.rigger.id })).status).toBe(400); // falta la grúa
      expect((await status({ craneId: await insertCrane("ABCD12") })).status).toBe(400); // falta el gruero
      expect((await status({ workerId: seed.rigger.id, craneId: await insertCrane("WXYZ99") })).status).toBe(200);
      const [row] = await sql`select crane_id, worker_id from appointments where id = ${id}`;
      expect(row.crane_id).not.toBeNull();
      expect(row.worker_id).toBe(seed.rigger.id);
    });

    test("dar de baja o borrar la grúa no rompe los servicios; el Excel de grúas muestra la grúa", async () => {
      const id = await insertService();
      const craneId = await insertCrane("ABCD12");
      await assign(id, { workerId: seed.rigger.id, craneId });
      const report = await fetch(`${server.url}/api/admin/reports/grua?startDate=2030-01-01&endDate=2030-01-31`, { headers: cookieFor(seed.admin) });
      expect(report.status).toBe(200);
      expect((await report.arrayBuffer()).byteLength).toBeGreaterThan(500);

      await sql`delete from cranes where id = ${craneId}`;
      const [row] = await sql`select crane_id from appointments where id = ${id}`;
      expect(row.crane_id).toBeNull();
    });
  });
});
