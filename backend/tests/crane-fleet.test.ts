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
});
