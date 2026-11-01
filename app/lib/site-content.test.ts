import { describe, expect, test } from "bun:test";
import { ALL_FIELDS, DEFAULTS, GALLERY_IMAGES, SECTIONS, resolve } from "./site-content";
import { parseRich } from "./rich-text";

describe("contenido editable del sitio", () => {
  test("las claves son únicas y válidas para el backend", () => {
    const keys = ALL_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9][a-z0-9._-]{0,99}$/);
    expect(keys.length).toBeLessThanOrEqual(300); // máximo por guardado
  });

  test("los campos de imagen terminan en .image y empiezan con una imagen local", () => {
    for (const field of ALL_FIELDS) {
      expect(field.kind === "image").toBe(field.key.endsWith(".image"));
      if (field.kind === "image") expect(field.default.startsWith("/images/")).toBe(true);
    }
  });

  test("todas las imágenes originales están en la galería", () => {
    for (const field of ALL_FIELDS.filter((f) => f.kind === "image")) expect(GALLERY_IMAGES).toContain(field.default);
  });

  test("todos los campos tienen texto original y etiqueta", () => {
    for (const section of SECTIONS) {
      expect(section.fields.length).toBeGreaterThan(0);
      for (const field of section.fields) {
        expect(field.label).not.toBe("");
        expect(field.default).not.toBe("");
      }
    }
  });

  test("resolve usa lo editado y, si no hay, el original", () => {
    expect(resolve({ "hero.copy": "Nuevo" }, "hero.copy")).toBe("Nuevo");
    expect(resolve({}, "hero.copy")).toBe(DEFAULTS["hero.copy"]);
    expect(resolve({}, "no.existe")).toBe("");
  });

  test("parseRich: saltos de línea y énfasis, sin interpretar HTML", () => {
    expect(parseRich("Rescate y\n*transporte*\ncuando")).toEqual([
      { type: "text", value: "Rescate y" },
      { type: "br" },
      { type: "em", value: "transporte" },
      { type: "br" },
      { type: "text", value: "cuando" },
    ]);
    // El marcado se queda como texto: React lo escapa al mostrarlo.
    expect(parseRich("<script>alert(1)</script> *x*")).toEqual([
      { type: "text", value: "<script>alert(1)</script> " },
      { type: "em", value: "x" },
    ]);
    expect(parseRich("un * suelto")).toEqual([{ type: "text", value: "un * suelto" }]);
  });
});
