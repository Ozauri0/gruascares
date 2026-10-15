import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startServer, type TestServer } from "./helpers.js";

let server: TestServer;
beforeAll(async () => {
  server = await startServer({
    rateLimits: {
      loginPerAccount: { windowMs: 60_000, max: 3 },
      loginPerIp: { windowMs: 60_000, max: 100 },
      register: { windowMs: 60_000, max: 2 },
      publicAppointment: { windowMs: 60_000, max: 2 },
      availability: { windowMs: 60_000, max: 2 },
    },
  });
});
afterAll(async () => {
  await server.close();
});

const post = (path: string, body: unknown) =>
  fetch(`${server.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("SEC-4: rate limiting", () => {
  test("login: tras el máximo por cuenta responde 429 en español con Retry-After", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await post("/api/auth/login", { email: "a@test.cl", password: "x" })).status);
    expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
    expect(statuses[3]).toBe(429);

    const res = await post("/api/auth/login", { email: "a@test.cl", password: "x" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    const body = await res.json();
    expect(body.error).toBe("Too Many Requests");
    expect(body.message).toContain("intentos");
  });

  test("login: otra cuenta no queda bloqueada por la primera", async () => {
    const res = await post("/api/auth/login", { email: "otra@test.cl", password: "x" });
    expect(res.status).not.toBe(429);
  });

  test("registro limitado", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await post("/api/auth/register", {})).status);
    expect(statuses).toEqual([400, 400, 429]);
  });

  test("creación pública de citas limitada", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await post("/api/appointments", {})).status);
    expect(statuses).toEqual([400, 400, 429]);
  });

  test("consulta de disponibilidad limitada", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await fetch(`${server.url}/api/appointments/availability`)).status);
    expect(statuses).toEqual([400, 400, 429]);
  });

  test("un servidor nuevo parte con contadores en cero", async () => {
    const other = await startServer({ rateLimits: { register: { windowMs: 60_000, max: 1 } } });
    const res = await fetch(`${other.url}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(400);
    await other.close();
  });
});
