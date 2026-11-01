import { describe, expect, test } from "bun:test";
import { computeRutDv, formatRut, isValidRut, normalizeRut, whatsappUrl } from "./rut";

describe("RUT chileno (Módulo 11)", () => {
  test("computeRutDv calcula dígitos numéricos, 0 y K", () => {
    expect(computeRutDv("12345678")).toBe("5");
    expect(computeRutDv(12345678)).toBe("5");
    // DV = K (mod 10)
    expect(computeRutDv("11111112")).toBe("K");
    // DV = 0 (mod 11)
    expect(computeRutDv("11111103")).toBe("0");
    expect(computeRutDv("7654321")).toBe("6");
  });

  test("normalizeRut limpia puntos, espacios, ceros a la izquierda y pasa k a K", () => {
    expect(normalizeRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizeRut(" 11.111.112-k ")).toBe("11111112-K");
    expect(normalizeRut("123456785")).toBe("12345678-5");
    expect(normalizeRut("07.654.321-6")).toBe("7654321-6");
    expect(normalizeRut("")).toBe("");
    expect(normalizeRut("5")).toBe("5");
  });

  test("isValidRut acepta RUTs válidos de 7 y 8 dígitos (con o sin puntos/guion, k/K)", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("12345678-5")).toBe(true);
    expect(isValidRut("123456785")).toBe(true);
    expect(isValidRut("11.111.112-k")).toBe(true);
    expect(isValidRut("11111112-K")).toBe(true);
    expect(isValidRut("11111103-0")).toBe(true);
    expect(isValidRut("7.654.321-6")).toBe(true);
    expect(isValidRut("7654321-6")).toBe(true);
  });

  test("isValidRut rechaza dígitos verificadores incorrectos, cuerpos muy cortos o vacíos", () => {
    expect(isValidRut("12.345.678-9")).toBe(false);
    expect(isValidRut("12.345.678-K")).toBe(false);
    expect(isValidRut("11.111.112-0")).toBe(false);
    expect(isValidRut("123456-7")).toBe(false); // 6 dígitos en cuerpo (< 1.000.000)
    expect(isValidRut("0000001-9")).toBe(false);
    expect(isValidRut("123456789-0")).toBe(false); // 9 dígitos en cuerpo
    expect(isValidRut("")).toBe(false);
    expect(isValidRut("   ")).toBe(false);
    expect(isValidRut("abc-d")).toBe(false);
  });

  test("formatRut aplica puntos y guion", () => {
    expect(formatRut("12345678-5")).toBe("12.345.678-5");
    expect(formatRut("123456785")).toBe("12.345.678-5");
    expect(formatRut("11111112k")).toBe("11.111.112-K");
    expect(formatRut("7654321-6")).toBe("7.654.321-6");
    expect(formatRut("")).toBe("");
    expect(formatRut(null)).toBe("");
    expect(formatRut(undefined)).toBe("");
  });

  test("whatsappUrl normaliza teléfonos chilenos y arma enlace wa.me", () => {
    expect(whatsappUrl("+56 9 9162 7809")).toBe("https://wa.me/56991627809");
    expect(whatsappUrl("9 9162 7809")).toBe("https://wa.me/56991627809");
    expect(whatsappUrl("91627809")).toBe("https://wa.me/56991627809");
    expect(whatsappUrl("+56 9 9162 7809", "Hola Juan")).toBe("https://wa.me/56991627809?text=Hola%20Juan");
    expect(whatsappUrl("")).toBeNull();
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl(undefined)).toBeNull();
    expect(whatsappUrl("1234")).toBeNull();
  });
});
