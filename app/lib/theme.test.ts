import { describe, expect, test } from "bun:test";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, nextTheme, parseStoredTheme, resolveTheme } from "./theme";

describe("tema claro / modo noche", () => {
  test("parseStoredTheme acepta solo light o dark", () => {
    expect(parseStoredTheme("light")).toBe("light");
    expect(parseStoredTheme("dark")).toBe("dark");
    expect(parseStoredTheme("auto")).toBeNull();
    expect(parseStoredTheme(null)).toBeNull();
    expect(parseStoredTheme(undefined)).toBeNull();
  });

  test("resolveTheme prioriza lo guardado y cae a prefers-color-scheme", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  test("nextTheme alterna entre light y dark", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });

  test("THEME_INIT_SCRIPT usa la clave de localStorage y fija data-theme", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toContain("data-theme");
  });
});
