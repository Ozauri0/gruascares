import { describe, expect, test } from "bun:test";
import { EMPTY_TRANSFER, cargoIsVehicle, cargoLabel, transferPayload, validateTransfer } from "./cargo";

const full = { cargoType: "contenedor" as const, location: " Puerto seco ", destination: "Bodega Pucón ", cargoDetails: " 40 pies, 12 t " };

describe("traslados de grúa (#141)", () => {
  test("pide cada dato del traslado", () => {
    expect(validateTransfer(EMPTY_TRANSFER)).toContain("trasladar");
    expect(validateTransfer({ ...full, location: " " })).toContain("retiro");
    expect(validateTransfer({ ...full, destination: "" })).toContain("destino");
    expect(validateTransfer({ ...full, cargoDetails: "ab" })).toContain("Describe");
    expect(validateTransfer(full)).toBe("");
  });
  test("solo autos, camionetas y camiones llevan vehículo", () => {
    expect(["auto", "camioneta", "camion"].every(cargoIsVehicle)).toBe(true);
    expect(["contenedor", "maquinaria", "otro"].some(cargoIsVehicle)).toBe(false);
  });
  test("etiqueta y payload sin espacios sobrantes", () => {
    expect(cargoLabel("camion")).toBe("Camión");
    expect(cargoLabel(null)).toBe("");
    expect(transferPayload(full)).toEqual({ cargoType: "contenedor", location: "Puerto seco", destination: "Bodega Pucón", cargoDetails: "40 pies, 12 t" });
  });
});
