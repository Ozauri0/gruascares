import { describe, expect, test } from "bun:test";
import { clampQuantity, maxQuantity, MAX_CART_QUANTITY } from "./cart";

describe("clampQuantity", () => {
  test("mínimo 1 y enteros", () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-4)).toBe(1);
    expect(clampQuantity(2.9)).toBe(2);
    expect(clampQuantity(NaN)).toBe(1);
  });
  test("no pasa del stock conocido ni del tope general", () => {
    expect(clampQuantity(10, 4)).toBe(4);
    expect(clampQuantity(3, 4)).toBe(3);
    expect(clampQuantity(500)).toBe(MAX_CART_QUANTITY);
    expect(clampQuantity(500, 1000)).toBe(MAX_CART_QUANTITY);
    expect(clampQuantity(5, 0)).toBe(5); // stock desconocido o agotado: solo rige el tope general
  });

  test("maxQuantity usa el stock cuando se conoce", () => {
    expect(maxQuantity(7)).toBe(7);
    expect(maxQuantity(undefined)).toBe(MAX_CART_QUANTITY);
    expect(maxQuantity(0)).toBe(MAX_CART_QUANTITY);
  });
});
