import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { loadConfig } from "../src/config/env.js";
import { DEMO_ACCOUNTS, isDemoEmail } from "../src/config/demo.js";
import { dbReady, resetDb } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

function runSeed(): { exitCode: number; stdout: string } {
  const proc = Bun.spawnSync({
    cmd: ["bun", "src/db/seed.ts"],
    cwd: import.meta.dir + "/..",
    env: { PATH: process.env.PATH!, NODE_ENV: "development", DATABASE_URL: process.env.DATABASE_URL!, BCRYPT_ROUNDS: "4" },
  });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString() + proc.stderr.toString() };
}

describe("INT-2: configuración del modo demo", () => {
  test("DEMO_MODE en producción impide arrancar", () => {
    const prod = { NODE_ENV: "production", JWT_SECRET: "x".repeat(40), DATABASE_URL: "postgres://x", CORS_ORIGIN: "https://gruascares.cl" };
    expect(() => loadConfig({ ...prod, DEMO_MODE: "true" })).toThrow(/DEMO_MODE=true no está permitido en producción/);
    expect(loadConfig({ ...prod }).demoMode).toBe(false);
    expect(loadConfig({ NODE_ENV: "development", DEMO_MODE: "true" }).demoMode).toBe(true);
  });

  test("las cuentas demo usan el dominio reservado .test", () => {
    for (const email of Object.values(DEMO_ACCOUNTS)) expect(isDemoEmail(email)).toBe(true);
    expect(isDemoEmail("admin@gruascares.cl")).toBe(false);
  });
});

describe.skipIf(!dbReady)("INT-2: POST /api/auth/demo-login", () => {
  let on: TestServer;
  let off: TestServer;
  beforeAll(async () => {
    on = await startServer({ demoMode: true });
    off = await startServer({ demoMode: false });
  });
  afterAll(async () => {
    await on.close();
    await off.close();
  });
  beforeEach(async () => {
    await resetDb();
  });

  const demo = (server: TestServer, body: unknown) =>
    fetch(`${server.url}/api/auth/demo-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  test("seed idempotente: dos ejecuciones no duplican nada", async () => {
    const first = runSeed();
    expect(first.exitCode).toBe(0);
    const counts = async () =>
      JSON.stringify(
        (await sql`select (select count(*) from users) u, (select count(*) from services) s, (select count(*) from vehicles) v, (select count(*) from appointments) a, (select count(*) from service_records) r, (select count(*) from products) p`)[0]
      );
    const before = await counts();
    expect(runSeed().exitCode).toBe(0);
    expect(await counts()).toBe(before);
    const row = (await sql`select count(*)::int as n from users where email like '%@demo.test'`)[0];
    expect(row.n).toBe(5);
    expect((await sql`select count(*)::int as n from products`)[0].n).toBe(11);
  });

  test("sin DEMO_MODE el endpoint no existe (404)", async () => {
    runSeed();
    expect((await demo(off, { role: "admin" })).status).toBe(404);
  });

  test("con DEMO_MODE abre sesión real para cada rol, sin credenciales", async () => {
    runSeed();
    for (const role of ["usuario", "mecanico", "admin"] as const) {
      const res = await demo(on, { role });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.demo).toBe(true);
      expect(data.user.role).toBe(role);
      expect(data.user.email).toBe(DEMO_ACCOUNTS[role]);
      const cookie = /gc_token=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
      expect(res.headers.get("set-cookie")).toContain("HttpOnly");
      const me = await fetch(`${on.url}/api/auth/me`, { headers: { Cookie: `gc_token=${cookie}` } });
      expect(me.status).toBe(200);
      expect(((await me.json()) as any).user.role).toBe(role);
    }
  });

  test("la sesión demo de admin llega a las rutas de administración y la de cliente no", async () => {
    runSeed();
    const get = async (role: string, path: string) => {
      const res = await demo(on, { role });
      const cookie = /gc_token=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
      return fetch(`${on.url}${path}`, { headers: { Cookie: `gc_token=${cookie}` } });
    };
    expect((await get("admin", "/api/admin/metrics")).status).toBe(200);
    expect((await get("usuario", "/api/admin/metrics")).status).toBe(403);
    const mine = (await (await get("usuario", "/api/appointments/my")).json()) as any;
    expect(mine.appointments.length).toBeGreaterThan(0);
  });

  test("rol inválido o inyectado devuelve 400", async () => {
    runSeed();
    for (const role of ["superadmin", "constructor", "__proto__", "", undefined, 5]) {
      expect((await demo(on, { role })).status).toBe(400);
    }
    expect((await demo(on, {})).status).toBe(400);
  });

  test("sin usuarios demo sembrados responde 503 con instrucción", async () => {
    const res = await demo(on, { role: "admin" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).message).toContain("db:seed");
  });

  test("si la cuenta demo cambió de rol o fue desactivada, no se abre sesión", async () => {
    runSeed();
    await sql`update users set is_active = false where email = ${DEMO_ACCOUNTS.admin}`;
    expect((await demo(on, { role: "admin" })).status).toBe(503);
    await sql`update users set role = 'admin' where email = ${DEMO_ACCOUNTS.usuario}`;
    expect((await demo(on, { role: "usuario" })).status).toBe(503);
  });

  test("el inicio de sesión demo queda auditado", async () => {
    runSeed();
    await demo(on, { role: "mecanico" });
    for (let i = 0; i < 30; i++) {
      const rows = await sql`select user_email from audit_logs where action = 'DEMO_LOGIN'`;
      if (rows.length) {
        expect(rows[0].user_email).toBe(DEMO_ACCOUNTS.mecanico);
        return;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("no se auditó DEMO_LOGIN");
  });
});
