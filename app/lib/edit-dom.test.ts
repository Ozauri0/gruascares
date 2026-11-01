import { describe, expect, test } from "bun:test";
import { comparable } from "./edit-dom";

describe("comparación de textos del editor visual", () => {
  test("ignora espacios, saltos de línea y asteriscos de énfasis", () => {
    expect(comparable("Rescate y\n*transporte*\ncuando lo necesitas.")).toBe(comparable("Rescate y transporte cuando lo necesitas."));
    expect(comparable("  ")).toBe("");
  });
});
