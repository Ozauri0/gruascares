import { afterEach, describe, expect, test } from "bun:test";
import { buildRows, fetchWorkerStats, shiftMonth, type StatusCounts, type WorkerStat } from "./worker-stats";

const counts = (total: number, finalizada = 0, cancelada = 0): StatusCounts => ({ solicitada: 0, confirmada: 0, en_proceso: 0, finalizada, cancelada, total });
const worker = (name: string, types: WorkerStat["types"], taller: StatusCounts, grua: StatusCounts): WorkerStat => ({
  id: name, name, rut: "1-9", types, isActive: true, serviteca: taller, grua, total: taller.total + grua.total, finalizadas: taller.finalizada + grua.finalizada,
});
const team = [
  worker("Ana", ["mecanico"], counts(2, 2), counts(0)),
  worker("Beto", ["gruero"], counts(0), counts(5, 3, 1)),
  worker("Camilo", ["mecanico", "gruero"], counts(1, 1), counts(2, 1)),
  worker("Dora", ["mecanico"], counts(0), counts(0)),
];

describe("estadísticas de trabajadores (#146)", () => {
  test("«todos» junta las dos áreas de quien hace ambas, ordenado por asignaciones", () => {
    const rows = buildRows(team, "todos", "asignaciones");
    expect(rows.map((r) => [r.worker.name, r.total])).toEqual([["Beto", 5], ["Camilo", 3], ["Ana", 2], ["Dora", 0]]);
    expect(rows.find((r) => r.worker.name === "Camilo")).toMatchObject({ serviteca: 1, grua: 2, finalizadas: 2 });
  });
  test("cada área cuenta solo lo suyo, y Camilo aparece en las dos sin perder atenciones", () => {
    const taller = buildRows(team, "taller", "asignaciones");
    expect(taller.map((r) => [r.worker.name, r.total])).toEqual([["Ana", 2], ["Camilo", 1], ["Dora", 0]]);
    const grua = buildRows(team, "grua", "asignaciones");
    expect(grua.map((r) => [r.worker.name, r.total])).toEqual([["Beto", 5], ["Camilo", 2]]);
    expect(grua[0]).toMatchObject({ finalizadas: 3, canceladas: 1 });
  });
  test("ordena por finalizadas o por nombre", () => {
    // Empate en finalizadas (Ana y Camilo, 2): gana quien tiene más asignaciones
    expect(buildRows(team, "todos", "finalizadas").map((r) => r.worker.name).slice(0, 3)).toEqual(["Beto", "Camilo", "Ana"]);
    expect(buildRows(team, "todos", "nombre").map((r) => r.worker.name)).toEqual(["Ana", "Beto", "Camilo", "Dora"]);
  });
  test("cambia de mes cruzando el año", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("fetchWorkerStats", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  test("pide el mes a la API", async () => {
    let url = "";
    globalThis.fetch = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ month: "2026-03", workers: [], unassigned: { serviteca: 0, grua: 0 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const stats = await fetchWorkerStats("2026-03");
    expect(url).toBe("/api/admin/stats/workers?month=2026-03");
    expect(stats.month).toBe("2026-03");
  });
});
