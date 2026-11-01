import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe.skipIf(!dbReady)("estadísticas mensuales de trabajadores (#146)", () => {
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

  const call = async (user: Seed["admin"], path: string) => {
    const res = await fetch(`${server.url}${path}`, { headers: cookieFor(user) });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };
  let slot = 0;
  const add = async (serviceId: string, workerId: string | null, date: string, status: string) => {
    const time = `${String(8 + (slot++ % 12)).padStart(2, "0")}:30`;
    await sql`insert into appointments (user_id, service_id, worker_id, scheduled_date, time_slot, status)
      values (${seed.clientA.id}, ${serviceId}, ${workerId}, ${date}, ${time}, ${status})`;
  };

  test("solo el admin; el mes debe ser válido", async () => {
    expect((await call(seed.mechanic, "/api/admin/stats/workers")).status).toBe(403);
    expect((await call(seed.crane, "/api/admin/stats/workers")).status).toBe(403);
    expect((await call(seed.admin, "/api/admin/stats/workers?month=2026-13")).status).toBe(400);
    expect((await call(seed.admin, "/api/admin/stats/workers?month=hoy")).status).toBe(400);
    const current = await call(seed.admin, "/api/admin/stats/workers");
    expect(current.status).toBe(200);
    expect(current.body.month).toMatch(/^\d{4}-\d{2}$/);
  });

  test("cuenta las asignaciones del mes por trabajador, ordenadas de más a menos, y junta a quien hace ambas áreas", async () => {
    const { serviceAceite: taller, serviceGrua: grua } = seed;
    await add(taller.id, seed.mech.id, "2026-03-02", "finalizada");
    await add(taller.id, seed.mech.id, "2026-03-31", "cancelada");
    await add(grua.id, seed.rigger.id, "2026-03-10", "finalizada");
    await add(taller.id, seed.both.id, "2026-03-11", "finalizada");
    await add(grua.id, seed.both.id, "2026-03-12", "en_proceso");
    await add(grua.id, seed.both.id, "2026-03-13", "finalizada");
    await add(grua.id, null, "2026-03-14", "solicitada"); // sin trabajador
    await add(grua.id, null, "2026-03-15", "cancelada"); // cancelada sin trabajador: no cuenta
    await add(taller.id, seed.mech.id, "2026-04-01", "finalizada"); // otro mes
    await add(taller.id, seed.mech.id, "2026-02-28", "finalizada"); // otro mes

    const { status, body } = await call(seed.admin, "/api/admin/stats/workers?month=2026-03");
    expect(status).toBe(200);
    expect(body).toMatchObject({ month: "2026-03", from: "2026-03-01", to: "2026-03-31", unassigned: { serviteca: 0, grua: 1 } });

    const names = body.workers.map((w: any) => w.name);
    expect(names[0]).toBe("Camilo Mixto"); // 3 asignaciones: la mayor
    expect(body.workers.filter((w: any) => w.name === "Camilo Mixto")).toHaveLength(1); // una sola fila

    const both = body.workers.find((w: any) => w.id === seed.both.id);
    expect(both).toMatchObject({ total: 3, finalizadas: 2 });
    expect(both.serviteca).toMatchObject({ total: 1, finalizada: 1 });
    expect(both.grua).toMatchObject({ total: 2, finalizada: 1, en_proceso: 1 });

    const mech = body.workers.find((w: any) => w.id === seed.mech.id);
    expect(mech).toMatchObject({ total: 2, finalizadas: 1 });
    expect(mech.serviteca).toMatchObject({ total: 2, cancelada: 1 });
    expect(mech.grua.total).toBe(0);
    // Orden descendente por total
    const totals = body.workers.map((w: any) => w.total);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  test("los trabajadores activos sin atenciones salen con ceros y los de baja solo si trabajaron ese mes", async () => {
    await sql`update workers set is_active = false where id = ${seed.rigger.id}`;
    const empty = await call(seed.admin, "/api/admin/stats/workers?month=2026-03");
    expect(empty.body.workers.map((w: any) => w.id)).not.toContain(seed.rigger.id);
    expect(empty.body.workers.every((w: any) => w.total === 0)).toBe(true);

    await add(seed.serviceGrua.id, seed.rigger.id, "2026-03-10", "finalizada");
    const worked = await call(seed.admin, "/api/admin/stats/workers?month=2026-03");
    expect(worked.body.workers.find((w: any) => w.id === seed.rigger.id)).toMatchObject({ isActive: false, total: 1 });
  });
});
