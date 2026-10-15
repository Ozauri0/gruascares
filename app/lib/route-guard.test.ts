import { describe, expect, test } from "bun:test";
import { HOME_FOR_ROLE, fetchSessionRole, guardDecision, isRole } from "./route-guard";

describe("INT-4: decisión de acceso por rol", () => {
  test("sin sesión todo va a /login", () => {
    for (const path of ["/portal", "/portal/citas", "/mecanico", "/admin", "/admin/usuarios"]) {
      expect(guardDecision(path, null)).toEqual({ type: "login" });
    }
  });

  test("cliente: solo /portal; /admin y /mecanico lo devuelven a su inicio", () => {
    expect(guardDecision("/portal/vehiculos", "usuario")).toEqual({ type: "allow" });
    expect(guardDecision("/admin", "usuario")).toEqual({ type: "redirect", to: "/portal" });
    expect(guardDecision("/admin/usuarios", "usuario")).toEqual({ type: "redirect", to: "/portal" });
    expect(guardDecision("/mecanico", "usuario")).toEqual({ type: "redirect", to: "/portal" });
  });

  test("mecánico: /mecanico y /portal sí; /admin lo devuelve a /mecanico", () => {
    expect(guardDecision("/mecanico", "mecanico")).toEqual({ type: "allow" });
    expect(guardDecision("/portal", "mecanico")).toEqual({ type: "allow" });
    expect(guardDecision("/admin/calendario", "mecanico")).toEqual({ type: "redirect", to: "/mecanico" });
  });

  test("admin accede a todo", () => {
    for (const path of ["/admin", "/admin/catalogo", "/mecanico", "/portal"]) {
      expect(guardDecision(path, "admin")).toEqual({ type: "allow" });
    }
  });

  test("rutas con prefijo parecido no se confunden (/administracion no es /admin)", () => {
    expect(guardDecision("/administracion", "usuario")).toEqual({ type: "allow" });
  });

  test("isRole y rutas de inicio", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(HOME_FOR_ROLE.mecanico).toBe("/mecanico");
  });
});

describe("INT-4: rol de la sesión según el backend", () => {
  const respond = (status: number, body?: unknown) =>
    (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;

  test("sin cookie no consulta al backend", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await fetchSessionRole(undefined, "http://b", spy)).toBeNull();
    expect(called).toBe(false);
  });

  test("devuelve el rol del backend y reenvía la cookie", async () => {
    const seen: { url: string; cookie: string }[] = [];
    const spy = (async (url: string, init: RequestInit) => {
      seen.push({ url, cookie: (init.headers as Record<string, string>).cookie });
      return new Response(JSON.stringify({ user: { role: "mecanico" } }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchSessionRole("abc.def", "http://b:4000", spy)).toBe("mecanico");
    expect(seen).toEqual([{ url: "http://b:4000/api/auth/me", cookie: "gc_token=abc.def" }]);
  });

  test("sesión inválida (401), rol desconocido o respuesta rara → null", async () => {
    expect(await fetchSessionRole("t", "http://b", respond(401, { error: "Unauthorized" }))).toBeNull();
    expect(await fetchSessionRole("t", "http://b", respond(200, { user: { role: "superadmin" } }))).toBeNull();
    expect(await fetchSessionRole("t", "http://b", respond(200, {}))).toBeNull();
    expect(await fetchSessionRole("t", "http://b", respond(200, undefined))).toBeNull();
  });

  test("backend caído falla cerrado (null), no deja pasar", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await fetchSessionRole("t", "http://b", down)).toBeNull();
  });
});
