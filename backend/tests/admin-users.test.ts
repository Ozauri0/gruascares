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
  return { status: res.status, body: (await res.json()) as any };
};

describe.skipIf(!dbReady)("INT-10: GET /api/admin/users", () => {
  test("lista con total y sin datos sensibles", async () => {
    const { status, body } = await call(seed.admin, "GET", "/api/admin/users");
    expect(status).toBe(200);
    expect(body.total).toBe(5);
    expect(body.users).toHaveLength(5);
    for (const user of body.users) {
      expect(user.passwordHash).toBeUndefined();
      expect(user.password_hash).toBeUndefined();
      expect(user.tokenVersion).toBeUndefined();
    }
  });

  test("filtra por rol, estado y búsqueda (nombre o correo, sin comodines)", async () => {
    expect((await call(seed.admin, "GET", "/api/admin/users?role=mecanico")).body.users.map((u: any) => u.email)).toEqual(["mecanico@test.local"]);
    await sql`update users set is_active = false where id = ${seed.clientB.id}`;
    expect((await call(seed.admin, "GET", "/api/admin/users?active=false")).body.total).toBe(1);
    expect((await call(seed.admin, "GET", "/api/admin/users?q=cliente%20a")).body.users.map((u: any) => u.email)).toEqual(["a@test.local"]);
    expect((await call(seed.admin, "GET", "/api/admin/users?q=TEST.LOCAL")).body.total).toBe(5);
    // % y _ son texto literal: no devuelven todo
    expect((await call(seed.admin, "GET", "/api/admin/users?q=%25")).body.total).toBe(0);
    expect((await call(seed.admin, "GET", "/api/admin/users?q=_")).body.total).toBe(0);
  });

  test("pagina y valida filtros", async () => {
    const page = (await call(seed.admin, "GET", "/api/admin/users?limit=2&page=2")).body;
    expect(page.users).toHaveLength(2);
    expect(page.total).toBe(5);
    expect((await call(seed.admin, "GET", "/api/admin/users?role=root")).status).toBe(400);
    expect((await call(seed.admin, "GET", "/api/admin/users?active=quizas")).status).toBe(400);
  });

  test("solo administradores", async () => {
    expect((await call(seed.mechanic, "GET", "/api/admin/users")).status).toBe(403);
    expect((await call(seed.clientA, "GET", "/api/admin/users")).status).toBe(403);
    expect((await fetch(`${server.url}/api/admin/users`)).status).toBe(401);
  });
});

describe.skipIf(!dbReady)("INT-10: POST /api/admin/users", () => {
  const staff = { name: "Nuevo Mecánico", email: "Nuevo.Mec@Test.local", password: "clave-inicial-1", role: "mecanico", phone: "+56 9 1111 1111" };

  test("crea personal con correo normalizado, contraseña hasheada y sin exponerla", async () => {
    const { status, body } = await call(seed.admin, "POST", "/api/admin/users", staff);
    expect(status).toBe(201);
    expect(body.user.email).toBe("nuevo.mec@test.local");
    expect(body.user.role).toBe("mecanico");
    expect(JSON.stringify(body)).not.toContain("clave-inicial-1");
    const [row] = await sql`select password_hash from users where email = 'nuevo.mec@test.local'`;
    expect(row.password_hash).not.toContain("clave-inicial-1");
    // la cuenta nueva puede iniciar sesión
    const login = await fetch(`${server.url}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nuevo.mec@test.local", password: "clave-inicial-1" }) });
    expect(login.status).toBe(200);
  });

  test("valida rol (no se crean clientes), correo, contraseña y duplicados", async () => {
    expect((await call(seed.admin, "POST", "/api/admin/users", { ...staff, role: "usuario" })).status).toBe(400);
    expect((await call(seed.admin, "POST", "/api/admin/users", { ...staff, role: "root" })).status).toBe(400);
    expect((await call(seed.admin, "POST", "/api/admin/users", { ...staff, email: "no-es-correo" })).status).toBe(400);
    expect((await call(seed.admin, "POST", "/api/admin/users", { ...staff, password: "corta" })).status).toBe(400);
    expect((await call(seed.admin, "POST", "/api/admin/users", { ...staff, name: "" })).status).toBe(400);
    expect((await call(seed.admin, "POST", "/api/admin/users", { ...staff, email: seed.clientA.email })).status).toBe(409);
  });

  test("un mecánico no puede crear cuentas", async () => {
    expect((await call(seed.mechanic, "POST", "/api/admin/users", staff)).status).toBe(403);
  });
});

describe.skipIf(!dbReady)("INT-10: PATCH /api/admin/users/:id", () => {
  test("cambia el rol sin cerrar la sesión: los permisos nuevos rigen de inmediato", async () => {
    const mechanicSession = cookieFor(seed.mechanic);
    expect((await fetch(`${server.url}/api/mechanic/agenda`, { headers: mechanicSession })).status).toBe(200);

    const { status, body } = await call(seed.admin, "PATCH", `/api/admin/users/${seed.mechanic.id}`, { role: "usuario" });
    expect(status).toBe(200);
    expect(body.user.role).toBe("usuario");
    expect((await fetch(`${server.url}/api/mechanic/agenda`, { headers: mechanicSession })).status).toBe(403); // sigue con sesión, pero ya sin permiso de mecánico
    expect((await fetch(`${server.url}/api/auth/me`, { headers: mechanicSession })).status).toBe(200);
  });

  test("desactivar y reactivar", async () => {
    expect((await call(seed.admin, "PATCH", `/api/admin/users/${seed.clientA.id}`, { isActive: false })).body.user.isActive).toBe(false);
    const login = (password = "password123") => fetch(`${server.url}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: seed.clientA.email, password }) });
    expect((await login()).status).toBe(403);
    await call(seed.admin, "PATCH", `/api/admin/users/${seed.clientA.id}`, { isActive: true });
    expect((await login()).status).toBe(200);
  });

  test("editar nombre/teléfono no cierra sesiones", async () => {
    const session = cookieFor(seed.clientA);
    await call(seed.admin, "PATCH", `/api/admin/users/${seed.clientA.id}`, { name: "Nombre Nuevo", phone: null });
    expect((await fetch(`${server.url}/api/auth/me`, { headers: session })).status).toBe(200);
    const [row] = await sql`select name, phone from users where id = ${seed.clientA.id}`;
    expect(row.name).toBe("Nombre Nuevo");
    expect(row.phone).toBeNull();
  });

  test("el admin no puede quitarse su acceso ni desactivarse", async () => {
    expect((await call(seed.admin, "PATCH", `/api/admin/users/${seed.admin.id}`, { isActive: false })).status).toBe(409);
    expect((await call(seed.admin, "PATCH", `/api/admin/users/${seed.admin.id}`, { role: "mecanico" })).status).toBe(409);
  });

  test("dos administradores que se degradan a la vez no dejan el sistema sin admins", async () => {
    await sql`insert into users (name, email, password_hash, role) values ('Segundo Admin', 'admin2@test.local', 'x', 'admin')`;
    const [second] = await sql`select id, email, name from users where email = 'admin2@test.local'`;
    const secondAdmin: U = { id: second.id, email: second.email, name: second.name, role: "admin", tokenVersion: 0 };

    const results = await Promise.all([
      call(seed.admin, "PATCH", `/api/admin/users/${second.id}`, { role: "mecanico" }),
      call(secondAdmin, "PATCH", `/api/admin/users/${seed.admin.id}`, { role: "mecanico" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const [{ n }] = await sql`select count(*)::int as n from users where role = 'admin' and is_active`;
    expect(n).toBe(1);
  });

  test("validaciones y recursos inexistentes", async () => {
    expect((await call(seed.admin, "PATCH", "/api/admin/users/no-uuid", { isActive: false })).status).toBe(400);
    expect((await call(seed.admin, "PATCH", `/api/admin/users/${seed.clientA.id}`, {})).status).toBe(400);
    expect((await call(seed.admin, "PATCH", `/api/admin/users/${seed.clientA.id}`, { role: "dios" })).status).toBe(400);
    expect((await call(seed.admin, "PATCH", `/api/admin/users/${seed.clientA.id}`, { isActive: "si" })).status).toBe(400);
    expect((await call(seed.admin, "PATCH", "/api/admin/users/11111111-1111-4111-8111-111111111111", { isActive: false })).status).toBe(404);
    expect((await call(seed.mechanic, "PATCH", `/api/admin/users/${seed.clientA.id}`, { isActive: false })).status).toBe(403);
  });

  test("los cambios quedan auditados", async () => {
    await call(seed.admin, "PATCH", `/api/admin/users/${seed.clientA.id}`, { role: "mecanico" });
    await call(seed.admin, "POST", "/api/admin/users", { name: "Otro Staff", email: "otro@test.local", password: "clave-inicial-1", role: "admin" });
    for (let i = 0; i < 30; i++) {
      const rows = await sql`select action from audit_logs where action in ('USER_ROLE_CHANGED', 'USER_CREATED')`;
      if (rows.length >= 2) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("faltan eventos de auditoría");
  });
});

describe.skipIf(!dbReady)("INT-10: GET /api/mechanic/list", () => {
  test("devuelve personal activo (mecánicos y admins) ordenado, sin clientes ni inactivos", async () => {
    await sql`insert into users (name, email, password_hash, role, is_active) values ('Inactivo Mec', 'inactivo@test.local', 'x', 'mecanico', false)`;
    const { status, body } = await call(seed.mechanic, "GET", "/api/mechanic/list");
    expect(status).toBe(200);
    expect(body.staff.map((s: any) => s.name)).toEqual(["Admin Test", "Mecanico Test"]);
    expect(body.staff[0].email).toBeUndefined();
  });

  test("clientes no acceden", async () => {
    expect((await call(seed.clientA, "GET", "/api/mechanic/list")).status).toBe(403);
  });
});
