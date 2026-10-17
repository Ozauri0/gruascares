import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { areaOf, labelOf, levelOf } from "../src/services/audit/areas.js";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
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

type U = Seed["admin"];
const call = async (user: U, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${server.url}${path}`, { method, headers: cookieFor(user), body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};
const logs = (query = "") => call(seed.admin, "GET", `/api/admin/audit-logs${query}`);

async function waitFor(action: string) {
  for (let i = 0; i < 40; i++) {
    const rows = await sql`select 1 from audit_logs where action = ${action}`;
    if (rows.length) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`falta el evento ${action}`);
}

describe("clasificación de acciones", () => {
  test("cada acción cae en un área y un nivel", () => {
    expect(areaOf("CATALOG_UPDATED")).toBe("ventas");
    expect(areaOf("TECHNICAL_REPORT_SAVED")).toBe("taller");
    expect(areaOf("USER_ROLE_CHANGED")).toBe("administracion");
    expect(areaOf("USER_REGISTER")).toBe("cuentas");
    expect(areaOf("LOGIN_FAILED")).toBe("cuentas");
    expect(areaOf("APPOINTMENT_CANCEL")).toBe("clientes");
    expect(areaOf("SERVER_ERROR")).toBe("sistema");
    expect(areaOf("VEHICLE_UPDATED")).toBe("clientes");
    expect(areaOf("VEHICLE_UPDATED_BY_STAFF")).toBe("taller");
    expect(levelOf("SERVER_ERROR")).toBe("error");
    expect(levelOf("LOGIN_BLOCKED")).toBe("warn");
    expect(levelOf("CATALOG_CREATED")).toBe("info");
    expect(labelOf("DATA_EXPORT_CSV")).toContain("CSV");
  });
});

describe.skipIf(!dbReady)("registro de actividad (admin)", () => {
  test("muestra quién hizo qué, con área, y filtra por área y nivel", async () => {
    const product = { name: "Aceite prueba", description: "x", category: "Lubricantes", price: 1000, stock: 5, art: "oil" };
    expect((await call(seed.seller, "POST", "/api/admin/catalog", product)).status).toBe(201);
    await waitFor("CATALOG_CREATED");
    await sql`insert into audit_logs (action, entity_type, entity_id, details) values ('SERVER_ERROR', 'http', 'GET /api/x', '{"status":500}')`;

    const all = await logs();
    expect(all.status).toBe(200);
    const created = all.body.logs.find((l: any) => l.action === "CATALOG_CREATED");
    expect(created).toMatchObject({ area: "ventas", level: "info", userName: seed.seller.name });
    expect(created.userRoles).toContain("vendedor");

    const ventas = await logs("?area=ventas");
    expect(ventas.body.logs.map((l: any) => l.action)).toEqual(["CATALOG_CREATED"]);

    const errors = await logs("?level=error");
    expect(errors.body.total).toBe(1);
    expect(errors.body.logs[0].area).toBe("sistema");

    const byName = await logs(`?q=${encodeURIComponent(seed.seller.name)}`);
    expect(byName.body.logs.map((l: any) => l.action)).toEqual(["CATALOG_CREATED"]);
  });

  test("área o nivel inválidos dan 400 y solo el admin puede verlo", async () => {
    expect((await logs("?area=nada")).status).toBe(400);
    expect((await logs("?level=nada")).status).toBe(400);
    expect((await call(seed.seller, "GET", "/api/admin/audit-logs")).status).toBe(403);
    expect((await call(seed.mechanic, "GET", "/api/admin/audit-logs")).status).toBe(403);
  });
});

describe.skipIf(!dbReady)("cambios de vehículos en el registro", () => {
  const actionsOf = async (...like: string[]) => {
    for (let i = 0; i < 40; i++) {
      const rows = (await sql`select action, details from audit_logs where action like 'VEHICLE_%' order by created_at`) as unknown as { action: string; details: string }[];
      if (rows.length >= like.length) return rows;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("faltan eventos de vehículos");
  };

  test("el dueño crea, edita y borra: queda en Clientes con el detalle del cambio", async () => {
    const created = await call(seed.clientB, "POST", "/api/vehicles", { plate: "ZZZZ11", brand: "Kia", model: "Rio", year: 2020, mileage: 100 });
    expect(created.status).toBe(201);
    const id = created.body.vehicle.id;
    expect((await call(seed.clientB, "PATCH", `/api/vehicles/${id}`, { mileage: 250 })).status).toBe(200);
    expect((await call(seed.clientB, "PATCH", `/api/vehicles/${id}`, { mileage: 250 })).status).toBe(200); // sin cambios: no se registra
    expect((await call(seed.clientB, "DELETE", `/api/vehicles/${id}`)).status).toBe(200);

    const rows = await actionsOf("a", "b", "c");
    expect(rows.map((r) => r.action)).toEqual(["VEHICLE_CREATED", "VEHICLE_UPDATED", "VEHICLE_DELETED"]);
    expect(JSON.parse(rows[1].details).changes).toEqual({ mileage: { from: 100, to: 250 } });

    const list = await logs("?area=clientes");
    expect(list.body.logs.map((l: any) => l.action)).toContain("VEHICLE_DELETED");
  });

  test("el personal que edita o borra un vehículo ajeno queda en Taller", async () => {
    expect((await call(seed.mechanic, "PATCH", `/api/vehicles/${seed.vehicleA.id}`, { brand: "Toyota Corregido" })).status).toBe(200);
    expect((await call(seed.admin, "DELETE", `/api/vehicles/${seed.vehicleB.id}`)).status).toBe(200);
    const rows = await actionsOf("a", "b");
    expect(rows.map((r) => r.action).sort()).toEqual(["VEHICLE_DELETED_BY_STAFF", "VEHICLE_UPDATED_BY_STAFF"]);
    const taller = await logs("?area=taller");
    expect(taller.body.logs.map((l: any) => l.userName)).toContain(seed.mechanic.name);
  });
});
