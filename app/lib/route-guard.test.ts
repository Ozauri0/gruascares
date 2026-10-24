import { describe, expect, test } from "bun:test";
import { HOME_FOR_ROLE, areasFor, fetchSession, fetchSessionRole, guardDecision, isRole } from "./route-guard";

describe("INT-4: decisión de acceso por rol", () => {
  test("sin sesión todo va a /login", () => {
    for (const path of ["/portal", "/portal/citas", "/mecanico", "/admin", "/admin/usuarios", "/atencion-presencial"]) {
      expect(guardDecision(path, null)).toEqual({ type: "login" });
    }
  });

  test("/agendar exige sesión, pero la puede usar cualquier rol", () => {
    expect(guardDecision("/agendar", null)).toEqual({ type: "login" });
    for (const role of ["usuario", "mecanico", "vendedor", "admin"] as const) {
      expect(guardDecision("/agendar", role)).toEqual({ type: "allow" });
    }
  });

  test("/atencion-presencial permite a personal (mecánico, vendedor, admin) y redirige a cliente", () => {
    expect(guardDecision("/atencion-presencial", null)).toEqual({ type: "login" });
    expect(guardDecision("/atencion-presencial", "usuario")).toEqual({ type: "redirect", to: "/portal" });
    for (const role of ["mecanico", "vendedor", "admin"] as const) {
      expect(guardDecision("/atencion-presencial", role)).toEqual({ type: "allow" });
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

  test("vendedor: /vendedor y /portal sí; /admin y /mecanico lo devuelven a /vendedor", () => {
    expect(guardDecision("/vendedor", "vendedor")).toEqual({ type: "allow" });
    expect(guardDecision("/portal", "vendedor")).toEqual({ type: "allow" });
    expect(guardDecision("/admin/catalogo", "vendedor")).toEqual({ type: "redirect", to: "/vendedor" });
    expect(guardDecision("/mecanico", "vendedor")).toEqual({ type: "redirect", to: "/vendedor" });
    expect(guardDecision("/vendedor", "mecanico")).toEqual({ type: "redirect", to: "/mecanico" });
    expect(guardDecision("/vendedor", "usuario")).toEqual({ type: "redirect", to: "/portal" });
  });

  test("varios roles: basta con uno; si no, vuelve al inicio del rol principal", () => {
    expect(guardDecision("/vendedor", "mecanico", ["mecanico", "vendedor"])).toEqual({ type: "allow" });
    expect(guardDecision("/mecanico", "mecanico", ["mecanico", "vendedor"])).toEqual({ type: "allow" });
    expect(guardDecision("/admin", "mecanico", ["mecanico", "vendedor"])).toEqual({ type: "redirect", to: "/mecanico" });
    expect(guardDecision("/mecanico", "vendedor", ["vendedor", "mecanico"])).toEqual({ type: "allow" });
    expect(guardDecision("/admin/usuarios", "vendedor", ["vendedor", "admin"])).toEqual({ type: "allow" });
  });

  test("áreas disponibles: el portal de cliente es de todos; admin entra a todas", () => {
    expect(areasFor({ role: "usuario" })).toEqual(["usuario"]);
    expect(areasFor({ role: "vendedor" })).toEqual(["vendedor", "usuario"]);
    expect(areasFor({ role: "mecanico", roles: ["mecanico", "vendedor"] })).toEqual(["mecanico", "vendedor", "usuario"]);
    expect(areasFor({ role: "admin" })).toEqual(["admin", "mecanico", "vendedor", "usuario"]);
  });

  test("admin accede a todo", () => {
    for (const path of ["/admin", "/admin/catalogo", "/mecanico", "/portal", "/vendedor", "/atencion-presencial"]) {
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

  test("fetchSession entrega el rol principal y todos los roles", async () => {
    expect(await fetchSession("t", "http://b", respond(200, { user: { role: "mecanico", roles: ["mecanico", "vendedor", "x"] } }))).toEqual({ role: "mecanico", roles: ["mecanico", "vendedor"] });
    expect(await fetchSession("t", "http://b", respond(200, { user: { role: "usuario" } }))).toEqual({ role: "usuario", roles: ["usuario"] });
    expect(await fetchSession("t", "http://b", respond(401))).toBeNull();
  });

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
