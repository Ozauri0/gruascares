import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";
import { isValidIsoDate } from "../src/utils/dates.js";

let server: TestServer;
let seed: Seed;

beforeAll(async () => {
  if (dbReady) server = await startServer();
});
afterAll(async () => {
  if (server) await server.close();
});
beforeEach(async () => {
  if (!dbReady) return;
  await resetDb();
  seed = await seedBasics();
  await sql`insert into appointments (user_id, service_id, scheduled_date, time_slot, status) values
    (${seed.clientA.id}, ${seed.serviceAceite.id}, '2026-01-10', '10:30', 'finalizada'),
    (${seed.clientA.id}, ${seed.serviceGrua.id}, '2026-02-15', '11:30', 'solicitada'),
    (${seed.clientB.id}, ${seed.serviceAceite.id}, '2026-03-20', '14:00', 'finalizada')`;
  await sql`insert into audit_logs (action, entity_type, created_at) values
    ('A', 'x', '2026-01-10T12:00:00Z'), ('B', 'x', '2026-02-10T12:00:00Z'), ('C', 'x', '2026-03-10T12:00:00Z')`;
});

const get = (path: string, user = () => seed.admin) => fetch(`${server.url}${path}`, { headers: cookieFor(user()) });

describe("BUG-1: validación de fechas", () => {
  test("isValidIsoDate rechaza fechas inexistentes", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("26-01-01")).toBe(false);
    expect(isValidIsoDate(undefined)).toBe(false);
  });
});

describe.skipIf(!dbReady)("BUG-1: /api/admin/audit-logs", () => {
  test("sin filtros devuelve todos", async () => {
    const res = await get("/api/admin/audit-logs");
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(3);
  });

  test("filtra por rango de fechas (antes lanzaba ReferenceError)", async () => {
    const res = await get("/api/admin/audit-logs?startDate=2026-02-01&endDate=2026-02-28");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.logs[0].action).toBe("B");
  });

  test("endDate sin hora incluye el día completo", async () => {
    const res = await get("/api/admin/audit-logs?startDate=2026-01-10&endDate=2026-01-10");
    expect((await res.json()).total).toBe(1);
  });

  test("fechas inválidas devuelven 400", async () => {
    expect((await get("/api/admin/audit-logs?startDate=basura")).status).toBe(400);
    expect((await get("/api/admin/audit-logs?endDate=2026-99-99")).status).toBe(400);
  });
});

describe.skipIf(!dbReady)("BUG-1: /api/admin/export/appointments", () => {
  test("json sin filtros", async () => {
    const res = await get("/api/admin/export/appointments");
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(3);
  });

  test("filtra por fechas y estado", async () => {
    const res = await get("/api/admin/export/appointments?startDate=2026-01-01&endDate=2026-02-28&status=finalizada");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.appointments[0].scheduledDate).toBe("2026-01-10");
  });

  test("csv incluye cabecera y filas", async () => {
    const res = await get("/api/admin/export/appointments?format=csv&startDate=2026-01-01&endDate=2026-12-31");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("ID_Cita");
    expect(text.split("\r\n")).toHaveLength(4);
  });

  test("parámetros inválidos devuelven 400", async () => {
    expect((await get("/api/admin/export/appointments?status=inventado")).status).toBe(400);
    expect((await get("/api/admin/export/appointments?startDate=2026-02-31")).status).toBe(400);
    expect((await get("/api/admin/export/appointments?format=xml")).status).toBe(400);
  });

  test("solo administradores", async () => {
    expect((await get("/api/admin/export/appointments", () => seed.mechanic)).status).toBe(403);
    expect((await get("/api/admin/audit-logs", () => seed.clientA)).status).toBe(403);
  });
});
