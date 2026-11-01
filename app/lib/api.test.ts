import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ApiError, api, apiGet, apiPatch, apiPost } from "./api";

type FetchCall = { url: string; init: RequestInit };
const realFetch = globalThis.fetch;
const realWindow = (globalThis as { window?: unknown }).window;
let calls: FetchCall[] = [];

function mockFetch(status: number, body: unknown, rawText?: string) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const text = rawText ?? (body === undefined ? "" : JSON.stringify(body));
    return new Response(status === 204 ? null : text, { status });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as { window?: unknown }).window = realWindow;
});

describe("INT-1: cliente HTTP", () => {
  test("GET envía credenciales, Accept y arma la query sin valores vacíos", async () => {
    mockFetch(200, { ok: true });
    const data = await apiGet<{ ok: boolean }>("/api/mechanic/agenda", { date: "2026-10-20", status: undefined, page: 2, empty: "" });
    expect(data.ok).toBe(true);
    expect(calls[0].url).toBe("/api/mechanic/agenda?date=2026-10-20&page=2");
    expect(calls[0].init.credentials).toBe("include");
    expect((calls[0].init.headers as Record<string, string>).Accept).toBe("application/json");
    expect(calls[0].init.body).toBeUndefined();
  });

  test("POST serializa el cuerpo como JSON con Content-Type", async () => {
    mockFetch(201, { id: "1" });
    await apiPost("/api/vehicles", { plate: "ABCD12" });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify({ plate: "ABCD12" }));
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  test("PATCH usa el método correcto", async () => {
    mockFetch(200, {});
    await apiPatch("/api/appointments/abc/cancel");
    expect(calls[0].init.method).toBe("PATCH");
  });

  test("rechaza rutas que no empiezan con /api/ (evita llamar a otros orígenes)", async () => {
    mockFetch(200, {});
    await expect(api("https://evil.example/api/x")).rejects.toThrow("Ruta de API inválida");
    await expect(api("/otra/ruta")).rejects.toThrow("Ruta de API inválida");
    expect(calls).toHaveLength(0);
  });

  test("errores de la API se convierten en ApiError con el mensaje del backend", async () => {
    mockFetch(409, { error: "Conflict", message: "El horario ya no tiene cupos" });
    try {
      await apiPost("/api/appointments", {});
      throw new Error("debía fallar");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.status).toBe(409);
      expect(apiError.code).toBe("Conflict");
      expect(apiError.message).toBe("El horario ya no tiene cupos");
    }
  });

  test("errores sin cuerpo usan un mensaje en español por defecto", async () => {
    mockFetch(429, undefined, "");
    const error = (await apiGet("/api/health").catch((e) => e)) as ApiError;
    expect(error.status).toBe(429);
    expect(error.message).toContain("demasiadas solicitudes");
    mockFetch(500, undefined, "<html>Bad gateway</html>");
    const error500 = (await apiGet("/api/health").catch((e) => e)) as ApiError;
    expect(error500.status).toBe(500);
    expect(error500.message).toContain("error inesperado");
  });

  test("fallo de red devuelve ApiError con status 0", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const error = (await apiGet("/api/health").catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toContain("No se pudo conectar");
  });

  test("204 devuelve undefined", async () => {
    mockFetch(204, undefined);
    expect(await api("/api/algo", { method: "DELETE" })).toBeUndefined();
  });

  test("401 redirige a /login conservando la ruta, salvo en páginas de acceso", async () => {
    const assigned: string[] = [];
    (globalThis as { window?: unknown }).window = { location: { pathname: "/portal/citas", search: "?x=1", assign: (u: string) => assigned.push(u) } };
    mockFetch(401, { error: "Unauthorized", message: "Sesión inválida o expirada" });
    await apiGet("/api/auth/me").catch(() => null);
    expect(assigned).toEqual(["/login?redirect=%2Fportal%2Fcitas%3Fx%3D1"]);

    (globalThis as { window?: unknown }).window = { location: { pathname: "/login", search: "", assign: (u: string) => assigned.push(u) } };
    await apiGet("/api/auth/me").catch(() => null);
    expect(assigned).toHaveLength(1);

    (globalThis as { window?: unknown }).window = { location: { pathname: "/portal", search: "", assign: (u: string) => assigned.push(u) } };
    await apiGet("/api/auth/me", undefined, { redirectOnUnauthorized: false }).catch(() => null);
    expect(assigned).toHaveLength(1);
  });
});
