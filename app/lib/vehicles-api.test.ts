import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "./api";
import { createVehicle, deleteVehicle, listVehicles, updateVehicle } from "./vehicles-api";

type Call = { url: string; init: RequestInit };
const realFetch = globalThis.fetch;
let calls: Call[] = [];
function respond(status: number, body?: unknown) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

const apiVehicle = { id: "v1", userId: "u1", plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021, mileage: 84500, notes: null };
const input = { plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021, mileage: 84500 };

describe("INT-5: vehículos contra la API", () => {
  test("listVehicles adapta la respuesta", async () => {
    respond(200, { count: 2, vehicles: [apiVehicle, { ...apiVehicle, id: "v2", year: null, mileage: null }] });
    const list = await listVehicles();
    expect(calls[0].url).toBe("/api/vehicles");
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ id: "v1", plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021, mileage: 84500 });
    expect(list[1].year).toBeNull();
    expect(list[1].mileage).toBe(0);
  });

  test("createVehicle hace POST con los datos y devuelve el vehículo adaptado", async () => {
    respond(201, { message: "ok", vehicle: apiVehicle });
    const created = await createVehicle(input);
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual(input);
    expect(created.id).toBe("v1");
  });

  test("updateVehicle hace PATCH al id (escapado)", async () => {
    respond(200, { message: "ok", vehicle: { ...apiVehicle, mileage: 90000 } });
    const updated = await updateVehicle("v 1/x", { ...input, mileage: 90000 });
    expect(calls[0].url).toBe("/api/vehicles/v%201%2Fx");
    expect(calls[0].init.method).toBe("PATCH");
    expect(updated.mileage).toBe(90000);
  });

  test("deleteVehicle hace DELETE", async () => {
    respond(200, { message: "ok", deletedId: "v1" });
    await deleteVehicle("v1");
    expect(calls[0].url).toBe("/api/vehicles/v1");
    expect(calls[0].init.method).toBe("DELETE");
  });

  test("patente duplicada llega como ApiError 409 con el mensaje del backend", async () => {
    respond(409, { error: "Conflict", message: "El vehículo con patente ABCD12 ya se encuentra registrado en tu cuenta" });
    const error = (await createVehicle(input).catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toContain("ABCD12");
  });
});
