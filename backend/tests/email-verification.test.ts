import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { testOutbox } from "../src/services/email/email.service.js";
import { makeValidRut } from "../src/utils/rut.js";
import { dbReady, resetDb, seedBasics, type Seed } from "./db.js";
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

const JSON_HEADERS = { "Content-Type": "application/json" };
const post = (path: string, body: unknown) => fetch(`${server.url}${path}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
const account = { name: "Persona Nueva", rut: makeValidRut(50), phone: "+56 9 8888 7777", email: "nueva@test.cl", password: "clave1234" };
const tokenFromLastEmail = () => decodeURIComponent(testOutbox.at(-1)!.html.match(/confirmar-correo\?token=([^"&\s<]+)/)![1]);

describe.skipIf(!dbReady)("confirmación de correo al registrarse", () => {
  test("registrarse envía el enlace y no inicia sesión hasta confirmarlo", async () => {
    const reg = await post("/api/auth/register", account);
    expect(reg.status).toBe(201);
    expect(reg.headers.get("set-cookie")).toBeNull();
    expect(testOutbox.at(-1)?.to).toBe("nueva@test.cl");
    expect(testOutbox.at(-1)?.subject).toContain("Confirma tu correo");

    const early = await post("/api/auth/login", account);
    expect(early.status).toBe(403);
    expect(((await early.json()) as any).error).toBe("EmailNotVerified");

    const verify = await post("/api/auth/verify-email", { token: tokenFromLastEmail() });
    expect(verify.status).toBe(200);
    expect(testOutbox.at(-1)?.subject).toContain("Bienvenido"); // la bienvenida llega al activar

    const login = await post("/api/auth/login", account);
    expect(login.status).toBe(200);
  });

  test("el enlace es de un solo uso, no sirve inventado ni vencido", async () => {
    await post("/api/auth/register", account);
    const token = tokenFromLastEmail();
    expect((await post("/api/auth/verify-email", { token })).status).toBe(200);
    expect((await post("/api/auth/verify-email", { token })).status).toBe(400);
    expect((await post("/api/auth/verify-email", { token: "x".repeat(43) })).status).toBe(400);
    expect((await post("/api/auth/verify-email", {})).status).toBe(400);

    await post("/api/auth/register", { ...account, rut: makeValidRut(51), email: "otra@test.cl" });
    const expired = tokenFromLastEmail();
    await sql`update email_verification_tokens set expires_at = now() - interval '1 minute'`;
    expect((await post("/api/auth/verify-email", { token: expired })).status).toBe(400);
  });

  test("reenviar deja vigente solo el último enlace y responde igual para correos desconocidos", async () => {
    await post("/api/auth/register", account);
    const first = tokenFromLastEmail();
    const resend = await post("/api/auth/resend-verification", { email: "NUEVA@test.cl" });
    expect(resend.status).toBe(200);
    const second = tokenFromLastEmail();
    expect(second).not.toBe(first);

    const unknown = await post("/api/auth/resend-verification", { email: "nadie@test.cl" });
    expect(unknown.status).toBe(200);
    expect(((await unknown.json()) as any).message).toBe(((await resend.json()) as any).message);

    expect((await post("/api/auth/verify-email", { token: first })).status).toBe(400);
    expect((await post("/api/auth/verify-email", { token: second })).status).toBe(200);
  });

  test("recuperar la contraseña por correo también confirma la cuenta", async () => {
    await post("/api/auth/register", account);
    await post("/api/auth/forgot-password", { email: account.email });
    const reset = decodeURIComponent(testOutbox.at(-1)!.html.match(/restablecer\?token=([^"&\s<]+)/)![1]);
    expect((await post("/api/auth/reset-password", { token: reset, password: "otraClave123" })).status).toBe(200);
    expect((await post("/api/auth/login", { email: account.email, password: "otraClave123" })).status).toBe(200);
  });

  test("las cuentas del equipo y las existentes no necesitan confirmar", async () => {
    expect((await post("/api/auth/login", { email: seed.clientA.email, password: "password123" })).status).toBe(200);
  });
});
