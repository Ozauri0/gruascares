import { afterAll, describe, expect, test } from "bun:test";
import { startServer } from "./helpers.js";

// Requiere un Redis: REDIS_URL_TEST=redis://127.0.0.1:6379 bun test tests/rate-limit-redis.test.ts (si no, se omite).
const REDIS = process.env.REDIS_URL_TEST;
const closers: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const close of closers) await close();
});

const login = (url: string, email: string) =>
  fetch(`${url}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "x" }) });

describe.skipIf(!REDIS)("límites de tasa compartidos en Redis", () => {
  test("dos instancias del backend comparten el contador (el límite es total, no por instancia)", async () => {
    const limits = { loginPerAccount: { windowMs: 60_000, max: 3 } };
    const a = await startServer({ redisUrl: REDIS, rateLimits: limits });
    const b = await startServer({ redisUrl: REDIS, rateLimits: limits });
    closers.push(a.close, b.close);
    const email = `compartido-${Date.now()}@test.local`;
    const statuses = [];
    for (const server of [a, b, a, b, a]) statuses.push((await login(server.url, email)).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]); // 3 intentos en total entre ambas
  });

  test("un servidor nuevo (reinicio) sigue viendo los intentos anteriores", async () => {
    const limits = { loginPerAccount: { windowMs: 60_000, max: 2 } };
    const email = `reinicio-${Date.now()}@test.local`;
    const first = await startServer({ redisUrl: REDIS, rateLimits: limits });
    await login(first.url, email);
    await login(first.url, email);
    await first.close();
    const second = await startServer({ redisUrl: REDIS, rateLimits: limits });
    closers.push(second.close);
    expect((await login(second.url, email)).status).toBe(429);
  });
});

describe("Redis caído", () => {
  test("login y registro se rechazan (429) y los demás límites dejan pasar", async () => {
    const server = await startServer({ redisUrl: "redis://127.0.0.1:1" }); // nadie escucha ahí
    closers.push(server.close);
    expect((await login(server.url, "a@test.local")).status).toBe(429);
    const register = await fetch(`${server.url}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(register.status).toBe(429);
    expect((await fetch(`${server.url}/api/appointments/availability?date=2030-01-01`)).status).not.toBe(429);
  });
});
