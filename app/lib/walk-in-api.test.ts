import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "./api";
import { createWalkInAppointment, createWalkInClient, lookupClientByRut } from "./walk-in-api";

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

describe("Atención presencial por RUT (walk-in API)", () => {
  test("lookupClientByRut devuelve cliente y vehículos cuando existe (200)", async () => {
    respond(200, {
      client: { id: "c1", rut: "12345678-5", name: "Pedro Soto", email: null, phone: "+56 9 8765 4321", hasAccount: false },
      vehicles: [{ id: "v1", plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021, mileage: 15000 }],
    });
    const res = await lookupClientByRut("12.345.678-5");
    expect(calls[0].url).toBe("/api/clients/by-rut?rut=12345678-5");
    expect(res).toEqual({
      client: { id: "c1", rut: "12345678-5", name: "Pedro Soto", email: null, phone: "+56 9 8765 4321", hasAccount: false },
      vehicles: [{ id: "v1", plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021, mileage: 15000 }],
    });
  });

  test("lookupClientByRut devuelve null si responde 404 y propaga otros errores", async () => {
    respond(404, { error: "Not Found", message: "No existe un cliente con ese RUT" });
    expect(await lookupClientByRut("12.345.678-5")).toBeNull();

    respond(500, { error: "Internal Server Error", message: "Error" });
    await expect(lookupClientByRut("12.345.678-5")).rejects.toBeInstanceOf(ApiError);
  });

  test("createWalkInClient normaliza RUT y omite correo vacío", async () => {
    const client = { id: "c1", rut: "12345678-5", name: "Pedro Soto", email: null, phone: "+56 9 8765 4321", hasAccount: false };
    respond(201, { client });
    const created = await createWalkInClient({ name: " Pedro Soto ", rut: "12.345.678-5", phone: " +56 9 8765 4321 ", email: "   " });
    expect(created).toEqual(client);
    expect(calls[0].url).toBe("/api/clients");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Pedro Soto",
      rut: "12345678-5",
      phone: "+56 9 8765 4321",
    });
  });

  test("createWalkInAppointment envía cliente nuevo y vehículo nuevo normalizados", async () => {
    const appointment = { id: "a1", scheduledDate: "2026-10-21", timeSlot: "10:30", status: "solicitada", serviceName: "Cambio de aceite" };
    respond(201, { appointment });
    const res = await createWalkInAppointment({
      serviceId: "s1",
      scheduledDate: "2026-10-21",
      timeSlot: "10:30",
      location: "Taller Villarrica",
      notes: "Revisión general",
      client: { name: " Pedro Soto ", rut: "12.345.678-5", phone: " +56 9 8765 4321 " },
      newVehicle: { plate: "ab·cd 12", brand: " Toyota ", model: " Hilux ", year: 2021 },
    });
    expect(res).toEqual(appointment);
    expect(calls[0].url).toBe("/api/appointments");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      serviceId: "s1",
      scheduledDate: "2026-10-21",
      timeSlot: "10:30",
      location: "Taller Villarrica",
      notes: "Revisión general",
      client: { name: "Pedro Soto", rut: "12345678-5", phone: "+56 9 8765 4321" },
      newVehicle: { plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021 },
    });
  });
});
