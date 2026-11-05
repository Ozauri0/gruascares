import { describe, expect, test } from "bun:test";
import { ALL_FIELDS, DEFAULTS, GALLERY_IMAGES, SECTIONS, SERVICES_COUNT_KEY, removeServiceCard, resolve, serviceCount, serviceOptions, serviceRequestName } from "./site-content";
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

describe("tarjetas de servicios dinámicas", () => {
  test("serviceCount usa 3 si no hay valor o es inválido", () => {
    expect(serviceCount(undefined)).toBe(3);
    expect(serviceCount("0")).toBe(3);
    expect(serviceCount("99")).toBe(3);
    expect(serviceCount("5")).toBe(5);
  });
  test("removeServiceCard sube las siguientes y baja la cantidad", () => {
    const values = { [SERVICES_COUNT_KEY]: "4", "service2.title": "B", "service3.title": "C", "service4.title": "D" };
    const out = removeServiceCard(values, 2);
    expect(out[SERVICES_COUNT_KEY]).toBe("3");
    expect(out["service2.title"]).toBe("C");
    expect(out["service3.title"]).toBe("D");
    expect(out["service4.title"]).toBe(DEFAULTS["service4.title"]);
  });
  test("no quita la única tarjeta", () => {
    expect(removeServiceCard({ [SERVICES_COUNT_KEY]: "1" }, 1)).toEqual({});
  });
});

describe("servicio solicitado por tarjeta", () => {
  const get = (v: Record<string, string>) => (k: string) => v[k] ?? DEFAULTS[k] ?? "";
  test("las tarjetas 1-3 conservan su nombre original y las extras usan su título", () => {
    expect(serviceRequestName(get({}), 2)).toBe("Transporte de cargas pesadas");
    expect(serviceRequestName(get({ "service5.title": "Rescate" }), 5)).toBe("Rescate");
  });
  test("al quitar una tarjeta, el servicio solicitado se mueve con ella", () => {
    const values = { [SERVICES_COUNT_KEY]: "3" };
    const out = { ...values, ...removeServiceCard(values, 1) };
    expect(serviceRequestName(get(out), 1)).toBe("Transporte de cargas pesadas");
    expect(serviceRequestName(get(out), 2)).toBe("Camiones grúa");
  });
  test("los valores por defecto de las tarjetas extra son únicos", () => {
    const extras = [4, 5, 6, 7, 8];
    for (const part of ["title", "text"]) expect(new Set(extras.map((n) => DEFAULTS[`service${n}.${part}`])).size).toBe(extras.length);
  });
  test("serviceOptions no repite y añade serviteca", () => {
    expect(serviceOptions(["A", "B", "A", " "])).toEqual(["A", "B", "Serviteca y taller"]);
    expect(serviceOptions(["Serviteca y taller"])).toEqual(["Serviteca y taller"]);
  });
});
