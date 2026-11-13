import { describe, expect, test } from "bun:test";
import { comparable, pickKey } from "./edit-dom";

describe("comparación de textos del editor visual", () => {
  test("ignora espacios, saltos de línea y asteriscos de énfasis", () => {
    expect(comparable("Rescate y\n*transporte*\ncuando lo necesitas.")).toBe(comparable("Rescate y transporte cuando lo necesitas."));
    expect(comparable("  ")).toBe("");
  });
});

describe("clave explícita de elementos", () => {
  test("la clave declarada gana sobre la casada por texto", () => {
    expect(pickKey("service5.title", "service4.title")).toBe("service5.title");
    expect(pickKey(null, "service4.title")).toBe("service4.title");
    expect(pickKey(undefined, undefined)).toBeUndefined();
  });
});
