import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { testOutbox } from "../src/services/email/email.service.js";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe.skipIf(!dbReady)("rol grúa y panel de grúas separado del taller (#129)", () => {
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
    testOutbox.length = 0;
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

  const insert = async (serviceId: string, status = "solicitada") => {
    const [row] = await sql`insert into appointments (user_id, vehicle_id, service_id, scheduled_date, time_slot, status)
      values (${seed.clientA.id}, ${seed.vehicleA.id}, ${serviceId}, ${futureDate()}, '10:30', ${status}) returning id`;
    return row.id as string;
  };

  test("cada jefe ve solo su área; el admin ve las dos", async () => {
    const grua = await insert(seed.serviceGrua.id);
    const taller = await insert(seed.serviceAceite.id);
    const ids = (r: { body: any }) => r.body.agenda.map((a: any) => a.id);

    expect(ids(await call(seed.crane, "GET", "/api/mechanic/agenda?area=grua"))).toEqual([grua]);
    expect(ids(await call(seed.crane, "GET", "/api/mechanic/agenda"))).toEqual([grua]); // por defecto, la suya
    expect(ids(await call(seed.mechanic, "GET", "/api/mechanic/agenda"))).toEqual([taller]);
    expect(ids(await call(seed.mechanic, "GET", "/api/mechanic/agenda?area=serviteca"))).toEqual([taller]);
    expect(ids(await call(seed.admin, "GET", "/api/mechanic/agenda?area=grua"))).toEqual([grua]);
    expect(ids(await call(seed.admin, "GET", "/api/mechanic/agenda?area=serviteca"))).toEqual([taller]);

    expect(ids(await call(seed.admin, "GET", "/api/mechanic/agenda?area=todas")).sort()).toEqual([grua, taller].sort()); // solo el admin ve las dos juntas
    expect((await call(seed.crane, "GET", "/api/mechanic/agenda?area=todas")).status).toBe(403);
    expect((await call(seed.mechanic, "GET", "/api/mechanic/agenda?area=todas")).status).toBe(403);
    expect((await call(seed.crane, "GET", "/api/mechanic/agenda?area=serviteca")).status).toBe(403);
    expect((await call(seed.mechanic, "GET", "/api/mechanic/agenda?area=grua")).status).toBe(403);
    expect((await call(seed.crane, "GET", "/api/mechanic/agenda?area=otra")).status).toBe(400);
    expect((await call(seed.clientA, "GET", "/api/mechanic/agenda?area=grua")).status).toBe(403);
  });

  test("no se pueden gestionar citas de la otra área", async () => {
    const grua = await insert(seed.serviceGrua.id);
    const taller = await insert(seed.serviceAceite.id);

    expect((await call(seed.mechanic, "PATCH", `/api/mechanic/appointments/${grua}/status`, { status: "confirmada" })).status).toBe(403);
    expect((await call(seed.crane, "PATCH", `/api/mechanic/appointments/${taller}/status`, { status: "confirmada" })).status).toBe(403);
    expect((await call(seed.mechanic, "PATCH", `/api/mechanic/appointments/${grua}/assign`, { workerId: seed.both.id })).status).toBe(403);
    expect((await call(seed.crane, "POST", `/api/mechanic/appointments/${taller}/report`, { observations: "intento de informe" })).status).toBe(403);
    expect((await call(seed.crane, "GET", `/api/mechanic/appointments/${taller}/report`)).status).toBe(403);
    const [{ status }] = await sql`select status from appointments where id = ${grua}`;
    expect(status).toBe("solicitada");
  });

  test("el jefe de grúas confirma, se asigna, inicia y finaliza con informe; el cliente recibe el aviso", async () => {
    const id = await insert(seed.serviceGrua.id);
    const confirmed = await call(seed.crane, "PATCH", `/api/mechanic/appointments/${id}/status`, { status: "confirmada" });
    expect(confirmed.status).toBe(200);
    expect(testOutbox.some((m) => m.to === "a@test.local")).toBe(true);

    const noWorker = await call(seed.crane, "PATCH", `/api/mechanic/appointments/${id}/status`, { status: "en_proceso" });
    expect(noWorker.status).toBe(400); // hay que asignar al gruero antes de iniciar
    expect((await call(seed.crane, "PATCH", `/api/mechanic/appointments/${id}/assign`, { workerId: seed.rigger.id })).status).toBe(200);
    expect((await call(seed.crane, "PATCH", `/api/mechanic/appointments/${id}/status`, { status: "en_proceso" })).status).toBe(200);
    const report = await call(seed.crane, "POST", `/api/mechanic/appointments/${id}/report`, { observations: "Traslado a taller sin novedades", mileageAtService: 1500 });
    expect(report.status).toBe(201);
    expect((await call(seed.clientA, "GET", `/api/mechanic/appointments/${id}/report`)).status).toBe(200); // el cliente ve su informe
    const [{ status }] = await sql`select status from appointments where id = ${id}`;
    expect(status).toBe("finalizada");
  });

  test("el trabajador asignado debe ser del tipo del servicio", async () => {
    const grua = await insert(seed.serviceGrua.id);
    const taller = await insert(seed.serviceAceite.id);
    const assign = (user: U, id: string, workerId: string, base = "mechanic") => call(user, "PATCH", `/api/${base}/appointments/${id}/assign`, { workerId });
    expect((await assign(seed.crane, grua, seed.mech.id)).status).toBe(400); // un mecánico no hace grúas
    expect((await assign(seed.mechanic, taller, seed.rigger.id)).status).toBe(400); // un gruero no hace serviteca
    expect((await assign(seed.crane, grua, seed.rigger.id)).status).toBe(200);
    expect((await assign(seed.admin, grua, seed.both.id)).status).toBe(200); // quien es mecánico y gruero sirve para ambos
    expect((await assign(seed.admin, taller, seed.both.id, "admin")).status).toBe(200);
    expect((await assign(seed.admin, taller, seed.rigger.id, "admin")).status).toBe(400);
    const status = await call(seed.crane, "PATCH", `/api/mechanic/appointments/${grua}/status`, { status: "confirmada", workerId: seed.mech.id });
    expect(status.status).toBe(400);
    const [row] = await sql`select worker_id, managed_by from appointments where id = ${grua}`;
    expect(row.worker_id).toBe(seed.both.id);
    expect(row.managed_by).toBe(seed.admin.id);
  });

  test("el admin asigna el rol grúa y el jefe no entra a la administración ni a ventas", async () => {
    const created = await call(seed.admin, "POST", "/api/admin/users", {
      name: "Nuevo Jefe Grúas", rut: "11111111-1", email: "jefe.gruas@test.local", phone: "+56 9 1111 2222", roles: ["grua"], password: "ClaveSegura123!",
    });
    expect(created.status).toBe(201);
    expect(created.body.user.roles).toEqual(["grua"]);

    expect((await call(seed.crane, "GET", "/api/admin/users")).status).toBe(403);
    expect((await call(seed.crane, "GET", "/api/admin/products")).status).toBe(403);
    expect((await call(seed.crane, "POST", "/api/clients", { name: "X", rut: "12345678-5", phone: "+56 9 1" })).status).toBe(403); // crear perfiles: solo ventas (#144)
    expect((await call(seed.crane, "GET", "/api/clients/by-rut?rut=" + seed.clientA.rut)).status).toBe(403); // el RUT en mostrador es solo de ventas (#144)
  });
});
