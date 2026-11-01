import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { parsePagination } from "../src/utils/pagination.js";
import { hashPassword, validatePassword, verifyPassword } from "../src/utils/password.js";
import { makeValidRut } from "../src/utils/rut.js";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe("SEC-9: política de contraseñas", () => {
  test("mínimo 8 caracteres y máximo 72 bytes", () => {
    expect(validatePassword("1234567")).toContain("al menos 8");
    expect(validatePassword("12345678")).toBeNull();
    expect(validatePassword("a".repeat(72))).toBeNull();
    expect(validatePassword("a".repeat(73))).toContain("72 bytes");
    expect(validatePassword("ñ".repeat(37))).toContain("72 bytes"); // 74 bytes en UTF-8
    expect(validatePassword(12345678)).not.toBeNull();
  });

  test("verifyPassword sin hash devuelve false (compara contra hash ficticio) y con hash valida", async () => {
    expect(await verifyPassword("cualquiera123", null)).toBe(false);
    const hash = await hashPassword("clave-correcta-1");
    expect(await verifyPassword("clave-correcta-1", hash)).toBe(true);
    expect(await verifyPassword("otra", hash)).toBe(false);
  });
});

describe("SEC-9: paginación segura", () => {
  test("valores por defecto, máximos y entradas inválidas", () => {
    expect(parsePagination({}, { limit: 50, maxLimit: 100 })).toEqual({ page: 1, limit: 50, offset: 0 });
    expect(parsePagination({ page: "3", limit: "10" }, { limit: 50, maxLimit: 100 })).toEqual({ page: 3, limit: 10, offset: 20 });
    expect(parsePagination({ limit: "99999" }, { limit: 50, maxLimit: 100 }).limit).toBe(100);
    expect(parsePagination({ page: "-4", limit: "abc" }, { limit: 50, maxLimit: 100 })).toEqual({ page: 1, limit: 50, offset: 0 });
  });
});

describe("SEC-9: db:seed bloqueado en producción", () => {
  test("sale con error y no toca la BD", () => {
    const proc = Bun.spawnSync({
      cmd: ["bun", "src/db/seed.ts"],
      cwd: import.meta.dir + "/..",
      env: { PATH: process.env.PATH!, NODE_ENV: "production", DATABASE_URL: "postgres://nadie:nada@127.0.0.1:1/x" },
    });
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain("bloqueado en producción");
  });
});

describe.skipIf(!dbReady)("SEC-9: login y paginación con BD", () => {
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

  const login = (email: string | null, password: unknown) =>
    fetch(`${server.url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

  test("usuario inexistente y clave incorrecta dan la misma respuesta", async () => {
    const unknown = await login("no-existe@test.cl", "password123");
    const wrong = await login(seed.clientA.email, "incorrecta123");
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await unknown.text()).toBe(await wrong.text());
  });

  test("una cuenta desactivada solo se revela con la contraseña correcta", async () => {
    await sql`update users set is_active = false where id = ${seed.clientA.id}`;
    const withWrong = await login(seed.clientA.email, "incorrecta123");
    expect(withWrong.status).toBe(401);
    const withRight = await login(seed.clientA.email, "password123");
    expect(withRight.status).toBe(403);
  });

  test("contraseña que no es texto o demasiado larga no entra", async () => {
    expect((await login(seed.clientA.email, 12345678)).status).toBe(400);
    expect((await login(seed.clientA.email, "a".repeat(500))).status).toBe(401);
  });

  test("registro exige contraseñas de 8+ caracteres y hasta 72 bytes", async () => {
    let idx = 300;
    const register = (password: string) =>
      fetch(`${server.url}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Persona Nueva",
          rut: makeValidRut(idx++),
          phone: "+56 9 4444 5555",
          email: `n${password.length}@test.cl`,
          password,
        }),
      });
    expect((await register("corta12")).status).toBe(400);
    expect((await register("a".repeat(73))).status).toBe(400);
    expect((await register("suficiente12")).status).toBe(201);
  });

  test("agenda del mecánico se pagina", async () => {
    for (let i = 0; i < 5; i++) {
      await sql`insert into appointments (user_id, service_id, scheduled_date, time_slot) values (${seed.clientA.id}, ${seed.serviceAceite.id}, ${`2030-01-0${i + 1}`}, '10:30')`;
    }
    const res = await fetch(`${server.url}/api/mechanic/agenda?limit=2&page=2`, { headers: cookieFor(seed.mechanic) });
    const data = (await res.json()) as any;
    expect(data.total).toBe(5);
    expect(data.count).toBe(2);
    expect(data.page).toBe(2);
    expect(data.agenda[0].scheduledDate).toBe("2030-01-03");
  });

  test("listado de vehículos del personal se pagina y limita", async () => {
    const res = await fetch(`${server.url}/api/vehicles?limit=1`, { headers: cookieFor(seed.admin) });
    const data = (await res.json()) as any;
    expect(data.total).toBe(2);
    expect(data.count).toBe(1);
    const capped = (await (await fetch(`${server.url}/api/vehicles?limit=100000`, { headers: cookieFor(seed.admin) })).json()) as any;
    expect(capped.limit).toBe(500);
  });
});
