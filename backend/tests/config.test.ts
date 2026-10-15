import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config/env.js";
import { startServer, type TestServer } from "./helpers.js";

const STRONG = "x".repeat(40);
const prodEnv = { NODE_ENV: "production", JWT_SECRET: STRONG, DATABASE_URL: "postgres://x", CORS_ORIGIN: "https://gruascares.cl" };

describe("SEC-3: configuración estricta", () => {
  test("sin NODE_ENV se asume producción y exige secretos", () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET es obligatorio/);
  });

  test("producción exige DATABASE_URL y CORS_ORIGIN", () => {
    expect(() => loadConfig({ NODE_ENV: "production", JWT_SECRET: STRONG })).toThrow(/DATABASE_URL.*\n.*CORS_ORIGIN/);
  });

  test("producción rechaza secretos cortos o de ejemplo", () => {
    expect(() => loadConfig({ ...prodEnv, JWT_SECRET: "corto" })).toThrow(/al menos 32/);
    expect(() => loadConfig({ ...prodEnv, JWT_SECRET: "super_secret_jwt_key_gruas_cares_cambiar_en_produccion" })).toThrow(/ejemplo conocido/);
  });

  test("producción válida carga la configuración", () => {
    const cfg = loadConfig(prodEnv);
    expect(cfg.isProduction).toBe(true);
    expect(cfg.corsOrigins).toEqual(["https://gruascares.cl"]);
    expect(cfg.jwt.secret).toBe(STRONG);
  });

  test("desarrollo sin secreto genera uno temporal distinto en cada carga", () => {
    const a = loadConfig({ NODE_ENV: "development" });
    const b = loadConfig({ NODE_ENV: "development" });
    expect(a.jwt.secret.length).toBeGreaterThanOrEqual(32);
    expect(a.jwt.secret).not.toBe(b.jwt.secret);
    expect(a.jwt.secret).not.toBe("default_jwt_secret_change_me");
  });

  test("desarrollo ignora el secreto de ejemplo del .env.example antiguo", () => {
    const cfg = loadConfig({ NODE_ENV: "development", JWT_SECRET: "default_jwt_secret_change_me" });
    expect(cfg.jwt.secret).not.toBe("default_jwt_secret_change_me");
  });

  test("TRUST_PROXY admite false, true y número de saltos", () => {
    expect(loadConfig({ ...prodEnv }).trustProxy).toBe(false);
    expect(loadConfig({ ...prodEnv, TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(loadConfig({ ...prodEnv, TRUST_PROXY: "1" }).trustProxy).toBe(1);
  });
});

describe("SEC-3: CORS", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server.close();
  });

  test("origen no permitido recibe 403 (no 500)", async () => {
    const res = await fetch(`${server.url}/health`, { headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("origen configurado recibe cabeceras con credenciales", async () => {
    const res = await fetch(`${server.url}/health`, { headers: { Origin: "http://localhost:3000" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("en desarrollo localhost con otro puerto se acepta, otro host no", async () => {
    const ok = await fetch(`${server.url}/health`, { headers: { Origin: "http://localhost:5173" } });
    expect(ok.status).toBe(200);
    const bad = await fetch(`${server.url}/health`, { headers: { Origin: "http://localhost.evil.example" } });
    expect(bad.status).toBe(403);
  });

  test("peticiones sin Origin (curl, servidor a servidor) siguen funcionando", async () => {
    const res = await fetch(`${server.url}/health`);
    expect(res.status).toBe(200);
  });
});

describe("SEC-3: arranque en producción", () => {
  test("el servidor no arranca en producción con secretos ausentes o de ejemplo", () => {
    const proc = Bun.spawnSync({
      cmd: ["bun", "-e", `await import("./src/config/env.js")`],
      cwd: import.meta.dir + "/..",
      env: { PATH: process.env.PATH!, NODE_ENV: "production" },
    });
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain("Configuración inválida para producción");
  });
});
