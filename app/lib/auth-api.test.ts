import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "./api";
import { demoLoginRequest, fetchSession, loginRequest, logoutRequest, registerRequest, resendVerificationRequest, verifyEmailRequest } from "./auth-api";

type Call = { url: string; init: RequestInit };
const realFetch = globalThis.fetch;
const realWindow = (globalThis as { window?: unknown }).window;
let calls: Call[] = [];

function respond(status: number, body: unknown) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as { window?: unknown }).window = realWindow;
  calls = [];
});

const apiUser = { id: "u1", rut: "12345678-5", name: "María González", email: "cliente@demo.test", role: "usuario", phone: "+56 9 1111 2222" };

describe("INT-3: operaciones de sesión", () => {
  test("fetchSession devuelve el usuario adaptado", async () => {
    respond(200, { user: { ...apiUser, isActive: true, createdAt: "2026-01-01T00:00:00Z" } });
    const user = await fetchSession();
    expect(user?.email).toBe("cliente@demo.test");
    expect(user?.rut).toBe("12345678-5");
    expect(user?.isActive).toBe(true);
    expect(calls[0].url).toBe("/api/auth/me");
  });

  test("fetchSession devuelve null con 401 y NO redirige al login", async () => {
    const assigned: string[] = [];
    (globalThis as { window?: unknown }).window = { location: { pathname: "/portal", search: "", assign: (u: string) => assigned.push(u) } };
    respond(401, { error: "Unauthorized", message: "No autenticado" });
    expect(await fetchSession()).toBeNull();
    expect(assigned).toHaveLength(0);
  });

  test("fetchSession propaga errores de servidor", async () => {
    respond(500, { error: "Internal Server Error", message: "Boom" });
    await expect(fetchSession()).rejects.toBeInstanceOf(ApiError);
  });

  test("loginRequest envía credenciales y un 401 es 'credenciales inválidas', sin redirección", async () => {
    const assigned: string[] = [];
    (globalThis as { window?: unknown }).window = { location: { pathname: "/login", search: "", assign: (u: string) => assigned.push(u) } };
    respond(401, { error: "Unauthorized", message: "Credenciales inválidas" });
    const error = (await loginRequest("a@b.cl", "mala").catch((e) => e)) as ApiError;
    expect(error.message).toBe("Credenciales inválidas");
    expect(calls[0].init.body).toBe(JSON.stringify({ email: "a@b.cl", password: "mala" }));
    expect(assigned).toHaveLength(0);
  });

  test("registerRequest normaliza el RUT y envía el teléfono limpio", async () => {
    respond(201, { user: apiUser, verificationRequired: true });
    const result = await registerRequest({ name: "Ana", rut: "12.345.678-5", email: "a@b.cl", password: "clave1234", phone: " +56 9 1111 2222 " });
    expect(result).toEqual({ email: apiUser.email }); // sin sesión: solo el correo al que se envió el enlace
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Ana",
      rut: "12345678-5",
      email: "a@b.cl",
      phone: "+56 9 1111 2222",
      password: "clave1234",
    });
  });

  test("registerRequest propaga el 409 de correo o RUT repetido", async () => {
    respond(409, { error: "Conflict", message: "Ya existe una cuenta registrada con este correo electrónico" });
    const error = (await registerRequest({ name: "Ana", rut: "12345678-5", email: "a@b.cl", phone: "+56 9 1111 2222", password: "clave1234" }).catch((e) => e)) as ApiError;
    expect(error.status).toBe(409);
  });

  test("verifyEmailRequest y resendVerificationRequest llaman a sus rutas", async () => {
    respond(200, { message: "ok" });
    expect(await verifyEmailRequest("tok")).toBe("ok");
    expect(calls[0].url).toBe("/api/auth/verify-email");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ token: "tok" });
    respond(200, { message: "enviado" });
    expect(await resendVerificationRequest("a@b.cl")).toBe("enviado");
    expect(calls[1].url).toBe("/api/auth/resend-verification");
  });

  test("demoLoginRequest envía el rol y devuelve el usuario", async () => {
    respond(200, { demo: true, user: { ...apiUser, role: "admin" } });
    const user = await demoLoginRequest("admin");
    expect(user.role).toBe("admin");
    expect(calls[0].url).toBe("/api/auth/demo-login");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ role: "admin" });
  });

  test("demoLoginRequest explica cuando el modo demo está desactivado (404)", async () => {
    respond(404, { error: "Not Found", message: "La ruta solicitada no existe en este servidor" });
    const error = (await demoLoginRequest("usuario").catch((e) => e)) as ApiError;
    expect(error.code).toBe("DemoDisabled");
    expect(error.message).toContain("DEMO_MODE");
  });

  test("logoutRequest llama a POST /api/auth/logout", async () => {
    respond(200, { message: "ok" });
    await logoutRequest();
    expect(calls[0].url).toBe("/api/auth/logout");
    expect(calls[0].init.method).toBe("POST");
  });
});
