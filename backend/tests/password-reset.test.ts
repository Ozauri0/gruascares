import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { testOutbox } from "../src/services/email/email.service.js";
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
  testOutbox.length = 0;
});

const post = (path: string, body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
  fetch(`${server.url}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
const login = (email: string, password: string) => post("/api/auth/login", { email, password });

/** Pide el enlace y devuelve el token que viaja en el correo. */
async function requestToken(email: string): Promise<string> {
  const res = await post("/api/auth/forgot-password", { email });
  expect(res.status).toBe(200);
  for (let i = 0; i < 40; i++) {
    const mail = [...testOutbox].reverse().find((m) => m.to === email && m.subject.includes("Restablece"));
    if (mail) {
      const token = /restablecer\?token=([A-Za-z0-9_%-]+)/.exec(mail.text ?? "")?.[1];
      if (token) return decodeURIComponent(token);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("no llegó el correo de recuperación");
}

describe.skipIf(!dbReady)("INT-10: recuperación de contraseña", () => {
  test("flujo completo: solicitar, restablecer, entrar con la nueva y no con la antigua", async () => {
    const token = await requestToken(seed.clientA.email);
    expect(token.length).toBeGreaterThanOrEqual(40);

    const reset = await post("/api/auth/reset-password", { token, password: "nueva-clave-segura-1" });
    expect(reset.status).toBe(200);
    expect((await login(seed.clientA.email, "password123")).status).toBe(401);
    expect((await login(seed.clientA.email, "nueva-clave-segura-1")).status).toBe(200);
  });

  test("solo se guarda el hash del token (nunca el token)", async () => {
    const token = await requestToken(seed.clientA.email);
    const rows = await sql`select token_hash from password_reset_tokens`;
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toContain(token);
    expect(rows[0].token_hash).toHaveLength(64);
  });

  test("responde igual para correos inexistentes (y no envía nada)", async () => {
    const known = await post("/api/auth/forgot-password", { email: seed.clientA.email });
    const unknown = await post("/api/auth/forgot-password", { email: "no-existe@test.cl" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.text()).toBe(await unknown.text());
    await new Promise((r) => setTimeout(r, 150));
    expect(testOutbox.filter((m) => m.to === "no-existe@test.cl")).toHaveLength(0);
  });

  test("cuentas desactivadas no reciben enlace", async () => {
    await sql`update users set is_active = false where id = ${seed.clientA.id}`;
    expect((await post("/api/auth/forgot-password", { email: seed.clientA.email })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 150));
    expect(testOutbox.filter((m) => m.to === seed.clientA.email)).toHaveLength(0);
    expect((await sql`select count(*)::int as n from password_reset_tokens`)[0].n).toBe(0);
  });

  test("el token es de un solo uso", async () => {
    const token = await requestToken(seed.clientA.email);
    expect((await post("/api/auth/reset-password", { token, password: "nueva-clave-segura-1" })).status).toBe(200);
    expect((await post("/api/auth/reset-password", { token, password: "otra-clave-segura-2" })).status).toBe(400);
    expect((await login(seed.clientA.email, "nueva-clave-segura-1")).status).toBe(200);
  });

  test("un enlace nuevo invalida los anteriores", async () => {
    const first = await requestToken(seed.clientA.email);
    testOutbox.length = 0;
    const second = await requestToken(seed.clientA.email);
    expect(second).not.toBe(first);
    expect((await post("/api/auth/reset-password", { token: first, password: "nueva-clave-segura-1" })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { token: second, password: "nueva-clave-segura-1" })).status).toBe(200);
  });

  test("tokens vencidos, inventados o malformados se rechazan", async () => {
    const token = await requestToken(seed.clientA.email);
    await sql`update password_reset_tokens set expires_at = now() - interval '1 minute'`;
    expect((await post("/api/auth/reset-password", { token, password: "nueva-clave-segura-1" })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { token: "x".repeat(43), password: "nueva-clave-segura-1" })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { token: "corto", password: "nueva-clave-segura-1" })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { token: 12345, password: "nueva-clave-segura-1" })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { password: "nueva-clave-segura-1" })).status).toBe(400);
  });

  test("aplica la política de contraseñas y no consume el token si falla", async () => {
    const token = await requestToken(seed.clientA.email);
    expect((await post("/api/auth/reset-password", { token, password: "corta" })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { token, password: "a".repeat(73) })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { token, password: "nueva-clave-segura-1" })).status).toBe(200); // sigue sirviendo
  });

  test("restablecer cierra todas las sesiones abiertas", async () => {
    const session = cookieFor(seed.clientA);
    expect((await fetch(`${server.url}/api/auth/me`, { headers: session })).status).toBe(200);
    const token = await requestToken(seed.clientA.email);
    await post("/api/auth/reset-password", { token, password: "nueva-clave-segura-1" });
    expect((await fetch(`${server.url}/api/auth/me`, { headers: session })).status).toBe(401);
  });

  test("dos usos simultáneos del mismo token: solo uno gana", async () => {
    const token = await requestToken(seed.clientA.email);
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => post("/api/auth/reset-password", { token, password: `clave-simultanea-${i}-x` })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400, 400, 400]);
  });

  test("correo inválido o ausente devuelve 400", async () => {
    expect((await post("/api/auth/forgot-password", { email: "no-es-correo" })).status).toBe(400);
    expect((await post("/api/auth/forgot-password", {})).status).toBe(400);
    expect((await post("/api/auth/forgot-password", { email: 5 })).status).toBe(400);
  });

  test("la solicitud y el restablecimiento quedan auditados, sin guardar el token", async () => {
    const token = await requestToken(seed.clientA.email);
    await post("/api/auth/reset-password", { token, password: "nueva-clave-segura-1" });
    for (let i = 0; i < 30; i++) {
      const rows = await sql`select action, details from audit_logs where action like 'PASSWORD_RESET%'`;
      if (rows.length >= 2) {
        expect(JSON.stringify(rows)).not.toContain(token);
        return;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("faltan eventos de auditoría");
  });

  test("el correo escapa el nombre y usa la URL pública configurada", async () => {
    await sql`update users set name = '<img src=x onerror=alert(1)>' where id = ${seed.clientA.id}`;
    await requestToken(seed.clientA.email);
    const mail = testOutbox.find((m) => m.to === seed.clientA.email)!;
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img");
    expect(mail.text).toContain("http://localhost:3000/restablecer?token=");
  });
});

describe.skipIf(!dbReady)("INT-10: PATCH /api/auth/me", () => {
  const patch = (user: { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario" | "vendedor" }, body: unknown) =>
    fetch(`${server.url}/api/auth/me`, { method: "PATCH", headers: cookieFor(user), body: JSON.stringify(body) });

  test("edita nombre y teléfono, sin tocar correo ni rol", async () => {
    const res = await patch(seed.clientA, { name: "  María Nueva  ", phone: "+56 9 7777 7777", email: "hack@x.cl", role: "admin" });
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as any;
    expect(user).toMatchObject({ name: "María Nueva", phone: "+56 9 7777 7777", email: seed.clientA.email, role: "usuario" });
    const [row] = await sql`select role, email from users where id = ${seed.clientA.id}`;
    expect(row).toMatchObject({ role: "usuario", email: seed.clientA.email });
  });

  test("teléfono null o vacío lo borra; la sesión sigue activa", async () => {
    await patch(seed.clientA, { phone: "+56 9 1" });
    const res = await patch(seed.clientA, { phone: "" });
    expect(((await res.json()) as any).user.phone).toBeNull();
    expect((await fetch(`${server.url}/api/auth/me`, { headers: cookieFor(seed.clientA) })).status).toBe(200);
  });

  test("valida entradas y requiere sesión", async () => {
    expect((await patch(seed.clientA, {})).status).toBe(400);
    expect((await patch(seed.clientA, { name: "x" })).status).toBe(400);
    expect((await patch(seed.clientA, { name: 5 })).status).toBe(400);
    expect((await patch(seed.clientA, { phone: 12345 })).status).toBe(400);
    expect((await patch(seed.clientA, { name: "a".repeat(101) })).status).toBe(400);
    expect((await fetch(`${server.url}/api/auth/me`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
  });
});
