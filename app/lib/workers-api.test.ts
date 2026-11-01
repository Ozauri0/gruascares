import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "./api";
import { WORKER_TYPE_FOR_AREA, createWorker, listWorkers, updateWorker } from "./workers-api";

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

const worker = { id: "w1", name: "Pedro Taller", rut: "10000007-5", phone: null, types: ["mecanico"], isActive: true };

describe("trabajadores sin cuenta (#130)", () => {
  test("cada área atiende con su tipo de trabajador", () => {
    expect(WORKER_TYPE_FOR_AREA).toEqual({ serviteca: "mecanico", grua: "gruero" });
  });

  test("listWorkers filtra por área y estado", async () => {
    respond(200, { workers: [worker] });
    expect(await listWorkers(undefined, "grua", true)).toEqual([worker] as never);
    expect(calls[0].url).toBe("/api/workers?area=grua&active=true");
    respond(200, { workers: [] });
    await listWorkers();
    expect(calls[1].url).toBe("/api/workers");
  });

  test("createWorker y updateWorker envían los datos y devuelven el trabajador", async () => {
    respond(201, { worker });
    expect(await createWorker({ name: "Pedro Taller", rut: "10.000.007-5", types: ["mecanico"] })).toEqual(worker as never);
    expect(calls[0].url).toBe("/api/workers");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: "Pedro Taller", rut: "10.000.007-5", types: ["mecanico"] });

    respond(200, { worker: { ...worker, isActive: false } });
    expect((await updateWorker("w 1", { isActive: false })).isActive).toBe(false);
    expect(calls[1].url).toBe("/api/workers/w%201");
    expect(calls[1].init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ isActive: false });
  });

  test("un RUT repetido llega como ApiError 409 con el mensaje del backend", async () => {
    respond(409, { error: "Conflict", message: "Ya existe un trabajador con ese RUT" });
    const error = (await createWorker({ name: "Otro", rut: "10.000.007-5", types: ["mecanico"] }).catch((e) => e)) as ApiError;
    expect(error.status).toBe(409);
    expect(error.message).toBe("Ya existe un trabajador con ese RUT");
  });
});
