import { describe, expect, test } from "bun:test";
import { matchesFilter } from "./agenda-filter";

describe("filtro de la agenda", () => {
  test("«todas» no incluye las canceladas", () => {
    expect(matchesFilter("confirmada", "todas")).toBe(true);
    expect(matchesFilter("finalizada", "todas")).toBe(true);
    expect(matchesFilter("cancelada", "todas")).toBe(false);
  });
  test("«cancelada» muestra solo las canceladas", () => {
    expect(matchesFilter("cancelada", "cancelada")).toBe(true);
    expect(matchesFilter("confirmada", "cancelada")).toBe(false);
  });
  test("cada estado filtra por sí mismo", () => {
    expect(matchesFilter("en_proceso", "en_proceso")).toBe(true);
    expect(matchesFilter("en_proceso", "finalizada")).toBe(false);
  });
});
