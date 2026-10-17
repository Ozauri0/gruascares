import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isSafeInternalPath, rememberRedirect, takeRememberedRedirect } from "./post-login";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("post-login", () => {
  test("solo acepta rutas internas", () => {
    expect(isSafeInternalPath("/agendar?servicio=aceite")).toBe(true);
    for (const bad of ["//evil.cl", "https://evil.cl", "/\\evil", "agendar", "", null, undefined]) expect(isSafeInternalPath(bad as never)).toBe(false);
  });

  test("recuerda la ruta una sola vez", () => {
    rememberRedirect("/agendar?servicio=aceite");
    expect(takeRememberedRedirect()).toBe("/agendar?servicio=aceite");
    expect(takeRememberedRedirect()).toBeNull();
  });

  test("no recuerda rutas externas ni vencidas", () => {
    rememberRedirect("//evil.cl");
    expect(takeRememberedRedirect()).toBeNull();
    store.set("gruas-cares-after-login", JSON.stringify({ path: "/agendar", at: Date.now() - 2 * 60 * 60 * 1000 }));
    expect(takeRememberedRedirect()).toBeNull();
  });
});
