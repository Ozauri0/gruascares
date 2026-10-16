import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
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

type U = { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario" | "vendedor"; tokenVersion?: number };
const call = async (user: U, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${server.url}${path}`, { method, headers: cookieFor(user), body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};
const setRoles = (id: string, roles: string[]) => call(seed.admin, "PATCH", `/api/admin/users/${id}`, { roles });

describe.skipIf(!dbReady)("usuarios con más de un rol", () => {
  test("el admin da un segundo rol: el mecánico también gestiona el catálogo y conserva su inicio", async () => {
    expect((await call(seed.mechanic, "GET", "/api/admin/catalog")).status).toBe(403);

    const patched = await setRoles(seed.mechanic.id, ["mecanico", "vendedor"]);
    expect(patched.status).toBe(200);
    expect(patched.body.user.role).toBe("mecanico"); // principal
    expect(patched.body.user.roles).toEqual(["mecanico", "vendedor"]);
    expect(patched.body.user.extraRoles).toBeUndefined();

    const mech = seed.mechanic; // misma sesión de antes: no se cierra al cambiar roles
    expect((await call(mech, "GET", "/api/admin/catalog")).status).toBe(200);
    expect((await call(mech, "GET", "/api/mechanic/list")).status).toBe(200); // sigue siendo mecánico
    expect((await call(mech, "GET", "/api/admin/metrics")).status).toBe(403); // sin acceso a lo demás

    const me = await call(mech, "GET", "/api/auth/me");
    expect(me.body.user.role).toBe("mecanico");
    expect(me.body.user.roles).toEqual(["mecanico", "vendedor"]);
  });

  test("el vendedor no ve datos de otros clientes (solo admin y mecánico)", async () => {
    const seller = seed.seller;
    const vehicles = await call(seller, "GET", "/api/vehicles");
    expect(vehicles.body.vehicles ?? []).toHaveLength(0);
    expect((await call(seller, "GET", `/api/vehicles/${seed.vehicleA.id}`)).status).toBe(403);
  });

  test("un vendedor que además es mecánico aparece en el personal de taller", async () => {
    await setRoles(seed.seller.id, ["vendedor", "mecanico"]);
    const { body } = await call(seed.admin, "GET", "/api/mechanic/list");
    const found = body.staff.find((s: any) => s.id === seed.seller.id);
    expect(found?.roles).toEqual(["vendedor", "mecanico"]);
  });

  test("filtra por rol incluyendo los adicionales", async () => {
    await setRoles(seed.mechanic.id, ["mecanico", "vendedor"]);
    const { body } = await call(seed.admin, "GET", "/api/admin/users?role=vendedor");
    expect(body.users.map((u: any) => u.email).sort()).toEqual(["mecanico@test.local", "vendedor@test.local"]);
  });

  test("validaciones: lista vacía, rol inválido y cliente mezclado con personal", async () => {
    expect((await setRoles(seed.mechanic.id, [])).status).toBe(400);
    expect((await setRoles(seed.mechanic.id, ["superjefe"])).status).toBe(400);
    expect((await setRoles(seed.mechanic.id, ["usuario", "vendedor"])).status).toBe(400);
  });

  test("quitar el rol principal pasa el siguiente a principal", async () => {
    await setRoles(seed.mechanic.id, ["mecanico", "vendedor"]);
    const { body } = await setRoles(seed.mechanic.id, ["vendedor"]);
    expect(body.user.role).toBe("vendedor");
    expect(body.user.roles).toEqual(["vendedor"]);
  });

  test("admin como rol adicional cuenta para 'al menos un administrador'", async () => {
    // El admin principal se vuelve vendedor + admin adicional: sigue siendo admin y no se bloquea
    const other = await call(seed.admin, "POST", "/api/admin/users", { name: "Ana Dos", email: "ana@test.local", password: "clave-inicial-1", roles: ["mecanico", "admin"] });
    expect(other.status).toBe(201);
    expect(other.body.user.roles).toEqual(["mecanico", "admin"]);
    // Ahora hay dos admins (uno por rol adicional): el primero puede dejar de serlo
    const demoted = await call(seed.admin, "PATCH", `/api/admin/users/${other.body.user.id}`, { roles: ["mecanico"] });
    expect(demoted.status).toBe(200);
    // Y el último administrador no puede perder el rol
    const last = await call({ ...seed.admin }, "PATCH", `/api/admin/users/${seed.admin.id}`, { roles: ["vendedor"] });
    expect(last.status).toBe(409);
  });

  test("al crear personal se pueden indicar varios roles", async () => {
    const res = await call(seed.admin, "POST", "/api/admin/users", { name: "Luis Dos", email: "luis@test.local", password: "clave-inicial-1", roles: ["vendedor", "mecanico"] });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("vendedor");
    expect(res.body.user.roles).toEqual(["vendedor", "mecanico"]);
    expect((await call(seed.admin, "POST", "/api/admin/users", { name: "Luis Tres", email: "l3@test.local", password: "clave-inicial-1", roles: ["usuario", "admin"] })).status).toBe(400);
  });

  test("el personal puede pedir solo sus propios vehículos (?mine=true) para usar el portal de cliente", async () => {
    // El mecánico ve todos los vehículos por su rol, pero con mine=true solo los suyos
    expect((await call(seed.mechanic, "GET", "/api/vehicles")).body.vehicles.length).toBe(2);
    expect((await call(seed.mechanic, "GET", "/api/vehicles?mine=true")).body.vehicles).toHaveLength(0);
    const created = await call(seed.mechanic, "POST", "/api/vehicles", { plate: "ZZZZ11", brand: "Kia", model: "Soul", year: 2019, mileage: 5000 });
    expect(created.status).toBe(201);
    const mine = (await call(seed.mechanic, "GET", "/api/vehicles?mine=true")).body.vehicles;
    expect(mine.map((v: any) => v.plate)).toEqual(["ZZZZ11"]);
  });
});
