import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "./api";
import { changeAppointmentStatus, fetchAgenda, saveReportAndFinish } from "./workshop-api";

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

describe("INT-8: taller contra la API", () => {
  test("fetchAgenda adapta citas de cuenta e invitado, con mecánico asignado", async () => {
    respond(200, {
      agenda: [
        {
          id: "a1", scheduledDate: "2026-10-20", timeSlot: "09:30", status: "confirmada", location: null, notes: "Revisar frenos",
          mechanicId: "m1", mechanicName: "Juan Paredes",
          client: { id: "u1", name: "María González", email: "m@x.cl", phone: "+56 9 1111 2222", isGuest: false },
          vehicle: { id: "v1", plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021, mileage: 1000 },
          service: { id: "s1", category: "serviteca", name: "Mantención" }, report: null,
        },
        {
          id: "a2", scheduledDate: "2026-10-20", timeSlot: "10:30", status: "solicitada", location: null, notes: null,
          mechanicId: null, mechanicName: null,
          client: { id: null, name: "Invitado", email: "i@x.cl", phone: null, isGuest: true },
          vehicle: null, service: { id: "s2", category: "grua", name: "Grúa" }, report: null,
        },
      ],
    });
    const agenda = await fetchAgenda("2026-10-20");
    expect(calls[0].url).toBe("/api/mechanic/agenda?date=2026-10-20");
    expect(agenda[0]).toMatchObject({ clientName: "María González", vehiclePlate: "ABCD12", vehicleLabel: "Toyota Hilux 2021", mechanicName: "Juan Paredes" });
    expect(agenda[1]).toMatchObject({ clientName: "Invitado", clientPhone: "", vehicleLabel: "Sin vehículo registrado", mechanicName: null });
  });

  test("fetchAgenda sin fecha trae todas las citas desde hace 30 días, de cualquier estado", async () => {
    respond(200, { agenda: [] });
    await fetchAgenda(undefined, undefined, "2026-10-16");
    expect(calls[0].url).toBe("/api/mechanic/agenda?startDate=2026-09-16&limit=500");
  });

  test("changeAppointmentStatus hace PATCH a la ruta del taller", async () => {
    respond(200, { appointment: {} });
    await changeAppointmentStatus("a 1", "en_proceso");
    expect(calls[0].url).toBe("/api/mechanic/appointments/a%201/status");
    expect(calls[0].init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ status: "en_proceso" });
  });

  test("transición inválida llega como ApiError 409 con el mensaje del backend", async () => {
    respond(409, { error: "Conflict", message: "No se puede pasar una cita de 'solicitada' a 'finalizada'." });
    const error = (await changeAppointmentStatus("a1", "finalizada").catch((e) => e)) as ApiError;
    expect(error.status).toBe(409);
    expect(error.message).toContain("solicitada");
  });

  test("saveReportAndFinish envía solo lo informado y pide finalizar", async () => {
    respond(201, { finalized: true });
    const result = await saveReportAndFinish("a1", { observations: "  Trabajo terminado  ", mileage: "1500", parts: "", recommendations: "Revisar frenos" });
    expect(result.finalized).toBe(true);
    expect(calls[0].url).toBe("/api/mechanic/appointments/a1/report");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ observations: "Trabajo terminado", mileageAtService: 1500, recommendations: "Revisar frenos", finalize: true });
  });

  test("kilometraje vacío no se envía", async () => {
    respond(201, { finalized: true });
    await saveReportAndFinish("a1", { observations: "Todo en orden", mileage: " ", parts: "", recommendations: "" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ observations: "Todo en orden", finalize: true });
  });
});
