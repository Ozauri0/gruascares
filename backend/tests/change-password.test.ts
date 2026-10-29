import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
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

const json = { "Content-Type": "application/json" };
const change = (cookie: string, body: unknown) =>
  fetch(`${server.url}/api/auth/change-password`, { method: "POST", headers: { ...json, Cookie: cookie }, body: JSON.stringify(body) });
const cookieOf = (user: Parameters<typeof cookieFor>[0]) => cookieFor(user).Cookie;
const login = (email: string | null, password: string) =>
  fetch(`${server.url}/api/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email, password }) });
const me = (cookie: string) => fetch(`${server.url}/api/auth/me`, { headers: { Cookie: cookie } });

describe.skipIf(!dbReady)("cambio de contraseña desde el perfil", () => {
  test("exige sesión", async () => {
    const res = await fetch(`${server.url}/api/auth/change-password`, { method: "POST", headers: json, body: "{}" });
    expect(res.status).toBe(401);
  });

  test("con la clave actual correcta cambia la clave, mantiene esta sesión y cierra las demás", async () => {
    const other = cookieOf(seed.clientA);
    const mine = cookieOf(seed.clientA);
    expect((await me(other)).status).toBe(200);

    const res = await change(mine, { currentPassword: "password123", newPassword: "clave-nueva-segura" });
    expect(res.status).toBe(200);
    const fresh = /gc_token=[^;]+/.exec(res.headers.get("set-cookie") ?? "")?.[0];
    expect(fresh).toBeTruthy();

    expect((await me(fresh!)).status).toBe(200); // esta sesión sigue abierta
    expect((await me(other)).status).toBe(401); // las otras se cerraron
    expect((await login(seed.clientA.email, "password123")).status).toBe(401);
    expect((await login(seed.clientA.email, "clave-nueva-segura")).status).toBe(200);
  });

  test("rechaza la clave actual incorrecta sin cambiar nada", async () => {
    const cookie = cookieOf(seed.clientA);
    const res = await change(cookie, { currentPassword: "equivocada", newPassword: "clave-nueva-segura" });
    expect(res.status).toBe(400);
    expect((await login(seed.clientA.email, "password123")).status).toBe(200);
  });

  test("valida la clave nueva: corta, demasiado larga e igual a la actual", async () => {
    const cookie = cookieOf(seed.clientA);
    expect((await change(cookie, { currentPassword: "password123", newPassword: "corta" })).status).toBe(400);
    expect((await change(cookie, { currentPassword: "password123", newPassword: "a".repeat(73) })).status).toBe(400);
    expect((await change(cookie, { currentPassword: "password123", newPassword: "password123" })).status).toBe(400);
    expect((await change(cookie, { newPassword: "clave-nueva-segura" })).status).toBe(400);
  });
});
