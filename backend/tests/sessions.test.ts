import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import jwt from "jsonwebtoken";
import { sql } from "../src/db/connection.js";
import { makeValidRut } from "../src/utils/rut.js";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, tokenFor, type TestServer } from "./helpers.js";

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

const me = (headers: Record<string, string>) => fetch(`${server.url}/api/auth/me`, { headers });

describe.skipIf(!dbReady)("SEC-7: sesiones validadas contra la BD", () => {
  test("token válido de usuario activo accede", async () => {
    const res = await me(cookieFor(seed.clientA));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).user.email).toBe(seed.clientA.email);
  });

  test("usuario desactivado pierde el acceso de inmediato", async () => {
    const headers = cookieFor(seed.clientA);
    expect((await me(headers)).status).toBe(200);
    await sql`update users set is_active = false where id = ${seed.clientA.id}`;
    expect((await me(headers)).status).toBe(401);
  });

  test("usuario degradado usa su rol actual de la BD, no el del token", async () => {
    const adminHeaders = cookieFor(seed.admin);
    expect((await fetch(`${server.url}/api/admin/metrics`, { headers: adminHeaders })).status).toBe(200);
    await sql`update users set role = 'usuario' where id = ${seed.admin.id}`;
    const res = await fetch(`${server.url}/api/admin/metrics`, { headers: adminHeaders });
    expect(res.status).toBe(403);
  });

  test("usuario eliminado no puede usar su token", async () => {
    const headers = cookieFor(seed.clientB);
    await sql`delete from users where id = ${seed.clientB.id}`;
    expect((await me(headers)).status).toBe(401);
  });

  test("logout-all invalida las sesiones existentes", async () => {
    const headers = cookieFor(seed.clientA);
    const other = cookieFor(seed.clientA); // otro dispositivo
    expect((await me(other)).status).toBe(200);
    const res = await fetch(`${server.url}/api/auth/logout-all`, { method: "POST", headers });
    expect(res.status).toBe(200);
    expect((await me(headers)).status).toBe(401);
    expect((await me(other)).status).toBe(401);
  });

  test("login emite una sesión nueva válida tras logout-all", async () => {
    await fetch(`${server.url}/api/auth/logout-all`, { method: "POST", headers: cookieFor(seed.clientA) });
    const login = await fetch(`${server.url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: seed.clientA.email, password: "password123" }),
    });
    expect(login.status).toBe(200);
    expect(((await login.json()) as any).token).toBeUndefined(); // el token solo viaja en la cookie httpOnly
    const cookie = /gc_token=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
    expect(cookie).toBeTruthy();
    expect((await me({ Cookie: `gc_token=${cookie}` })).status).toBe(200);
  });

  test("token firmado con otro algoritmo o secreto se rechaza", async () => {
    const none = jwt.sign({ userId: seed.admin.id, email: seed.admin.email, name: "x", role: "admin" }, "", { algorithm: "none" as never });
    expect((await me({ Cookie: `gc_token=${none}` })).status).toBe(401);
    const wrongSecret = jwt.sign({ userId: seed.admin.id, email: seed.admin.email, name: "x", role: "admin" }, "otro-secreto-distinto-123456789012345");
    expect((await me({ Cookie: `gc_token=${wrongSecret}` })).status).toBe(401);
  });

  test("token de un usuario que no existe se rechaza", async () => {
    expect((await me({ Cookie: `gc_token=${tokenFor("admin")}` })).status).toBe(401);
  });

  test("registro no abre sesión ni devuelve token: hay que confirmar el correo", async () => {
    const res = await fetch(`${server.url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nuevo", rut: makeValidRut(400), phone: "+56 9 5555 6666", email: "nuevo@test.local", password: "clave1234" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.token).toBeUndefined();
    expect(body.verificationRequired).toBe(true);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe.skipIf(!dbReady)("cerrar sesión revoca el token en el servidor", () => {
  const login = async () => {
    const res = await fetch(`${server.url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: seed.clientA.email, password: "password123" }),
    });
    expect(res.status).toBe(200);
    return /gc_token=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1];
  };
  const meWith = (token: string) => fetch(`${server.url}/api/auth/me`, { headers: { Cookie: `gc_token=${token}` } });

  test("el token usado antes del logout deja de servir, pero otra sesión de la persona sigue", async () => {
    const first = await login();
    const second = await login();
    expect((await meWith(first)).status).toBe(200);

    const out = await fetch(`${server.url}/api/auth/logout`, { method: "POST", headers: { Cookie: `gc_token=${first}` } });
    expect(out.status).toBe(200);

    expect((await meWith(first)).status).toBe(401); // aunque no haya vencido
    expect((await meWith(second)).status).toBe(200);
    const [{ n }] = await sql`select count(*)::int as n from revoked_tokens`;
    expect(n).toBe(1);
  });

  test("cerrar sesión sin cookie o con un token inválido responde 200 y no revoca nada", async () => {
    expect((await fetch(`${server.url}/api/auth/logout`, { method: "POST" })).status).toBe(200);
    expect((await fetch(`${server.url}/api/auth/logout`, { method: "POST", headers: { Cookie: "gc_token=basura" } })).status).toBe(200);
    const [{ n }] = await sql`select count(*)::int as n from revoked_tokens`;
    expect(n).toBe(0);
  });

  test("cerrar sesión dos veces con el mismo token no falla", async () => {
    const token = await login();
    for (let i = 0; i < 2; i++) {
      expect((await fetch(`${server.url}/api/auth/logout`, { method: "POST", headers: { Cookie: `gc_token=${token}` } })).status).toBe(200);
    }
  });
});
