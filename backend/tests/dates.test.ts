import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { clock, isSlotPast, isValidIsoDate, todayInSantiago, workshopNow } from "../src/utils/dates.js";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

const realNow = clock.now;
const setNow = (iso: string) => {
  clock.now = () => new Date(iso);
};
afterEach(() => {
  clock.now = realNow;
});

describe("BUG-6: hora de Chile", () => {
  test("verano chileno (UTC-3): 01:00Z del 16 es 22:00 del 15 en Santiago", () => {
    expect(workshopNow(new Date("2026-10-16T01:00:00Z"))).toEqual({ date: "2026-10-15", time: "22:00" });
  });

  test("invierno chileno (UTC-4): 03:30Z es 23:30 del día anterior", () => {
    expect(workshopNow(new Date("2026-06-16T03:30:00Z"))).toEqual({ date: "2026-06-15", time: "23:30" });
  });

  test("todayInSantiago difiere de la fecha UTC de noche", () => {
    const now = new Date("2026-10-16T01:00:00Z");
    expect(now.toISOString().slice(0, 10)).toBe("2026-10-16");
    expect(todayInSantiago(now)).toBe("2026-10-15");
  });

  test("isSlotPast compara fecha y hora del taller", () => {
    const now = new Date("2026-10-15T17:00:00Z"); // 14:00 en Santiago
    expect(isSlotPast("2026-10-14", "17:00", now)).toBe(true);
    expect(isSlotPast("2026-10-15", "10:30", now)).toBe(true);
    expect(isSlotPast("2026-10-15", "14:00", now)).toBe(true); // en curso
    expect(isSlotPast("2026-10-15", "15:00", now)).toBe(false);
    expect(isSlotPast("2026-10-16", "08:30", now)).toBe(false);
  });

  test("isValidIsoDate: bisiestos y límites", () => {
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2026-04-31")).toBe(false);
    expect(isValidIsoDate("2026-00-10")).toBe(false);
  });
});

describe.skipIf(!dbReady)("BUG-6: endpoints con fechas y hora", () => {
  let server: TestServer;
  let seed: Seed;
  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDb();
    seed = await seedBasics();
  });

  const book = (body: Record<string, unknown>) =>
    fetch(`${server.url}/api/appointments`, {
      method: "POST",
      headers: cookieFor(seed.clientA),
      body: JSON.stringify({ serviceId: seed.serviceAceite.id, ...body }),
    });

  test("fecha inexistente devuelve 400 (no 500) al agendar y consultar disponibilidad", async () => {
    expect((await book({ scheduledDate: "2099-02-31", timeSlot: "10:30" })).status).toBe(400);
    expect((await fetch(`${server.url}/api/appointments/availability?date=2099-02-31`)).status).toBe(400);
  });

  test("de noche en Chile (ya es mañana en UTC) el día de hoy sigue consultable", async () => {
    setNow("2026-10-16T01:00:00Z"); // 22:00 del 15 en Santiago
    const res = await fetch(`${server.url}/api/appointments/availability?date=2026-10-15`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.slots.every((s: any) => s.available === false)).toBe(true);
    expect(data.slots[0].reason).toContain("transcurrido");
  });

  test("ayer en hora de Chile se rechaza", async () => {
    setNow("2026-10-16T01:00:00Z");
    expect((await fetch(`${server.url}/api/appointments/availability?date=2026-10-14`)).status).toBe(400);
    expect((await book({ scheduledDate: "2026-10-14", timeSlot: "10:30" })).status).toBe(400);
  });

  test("hoy: los bloques ya pasados no están disponibles ni se pueden reservar", async () => {
    setNow("2026-10-15T17:30:00Z"); // 14:30 en Santiago
    const data = (await (await fetch(`${server.url}/api/appointments/availability?date=2026-10-15`)).json()) as any;
    const byTime = Object.fromEntries(data.slots.map((s: any) => [s.time, s.available]));
    expect(byTime["11:30"]).toBe(false);
    expect(byTime["14:00"]).toBe(false);
    expect(byTime["15:00"]).toBe(true);
    expect((await book({ scheduledDate: "2026-10-15", timeSlot: "11:30" })).status).toBe(400);
    expect((await book({ scheduledDate: "2026-10-15", timeSlot: "16:00" })).status).toBe(201);
  });

  test("mañana a primera hora siempre se puede reservar", async () => {
    setNow("2026-10-16T01:00:00Z");
    expect((await book({ scheduledDate: "2026-10-16", timeSlot: "08:30" })).status).toBe(201);
    expect((await book({ scheduledDate: futureDate(30), timeSlot: "08:30" })).status).toBe(201);
  });
});
