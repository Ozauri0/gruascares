import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { limits } from "../src/config/constants.js";
import { escapeCsvCell } from "../src/utils/csv.js";
import { logAudit } from "../src/services/audit/audit.service.js";
import { makeValidRut } from "../src/utils/rut.js";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe("SEC-8: CSV injection", () => {
  test("neutraliza celdas que empiezan con = + - @ tab o CR", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(escapeCsvCell(evil).startsWith(`"'`)).toBe(true);
    }
  });

  test("escapa comillas y respeta valores normales y números", () => {
    expect(escapeCsvCell('Dijo "hola"')).toBe('"Dijo ""hola"""');
    expect(escapeCsvCell("Juan Pérez")).toBe('"Juan Pérez"');
    expect(escapeCsvCell(-5)).toBe('"-5"'); // un número negativo real no es texto de usuario
    expect(escapeCsvCell(null)).toBe("");
  });
});

describe.skipIf(!dbReady)("SEC-8: auditoría y exportación", () => {
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
  afterEach(() => {
    limits.exportMaxRows = 20000;
  });

  const waitFor = async <T>(fn: () => Promise<T | undefined>, tries = 30): Promise<T> => {
    for (let i = 0; i < tries; i++) {
      const value = await fn();
      if (value) return value;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("timeout esperando evento de auditoría");
  };
  const actionsLogged = async () => (await sql`select action from audit_logs order by created_at`).map((r) => r.action as string);

  test("el CSV exportado neutraliza fórmulas en datos ingresados por clientes", async () => {
    const [evilUser] = await sql`insert into users (name, rut, phone, role) values ('=cmd|calc', ${makeValidRut(88)}, '+56 9 1111 2222', 'usuario') returning id`;
    await sql`insert into appointments (user_id, service_id, scheduled_date, time_slot, notes)
      values (${evilUser.id}, ${seed.serviceAceite.id}, ${futureDate()}, '10:30', '@SUM(1)')`;
    const res = await fetch(`${server.url}/api/admin/export/appointments?format=csv`, { headers: cookieFor(seed.admin) });
    const text = await res.text();
    expect(text).toContain(`"'=cmd|calc"`);
    expect(text).not.toContain(`,"=cmd|calc"`);
  });

  test("la exportación que supera el máximo responde 413", async () => {
    await sql`insert into appointments (user_id, service_id, scheduled_date, time_slot) values
      (${seed.clientA.id}, ${seed.serviceAceite.id}, '2030-01-01', '10:30'),
      (${seed.clientA.id}, ${seed.serviceAceite.id}, '2030-01-02', '10:30'),
      (${seed.clientA.id}, ${seed.serviceAceite.id}, '2030-01-03', '10:30')`;
    limits.exportMaxRows = 2;
    const res = await fetch(`${server.url}/api/admin/export/appointments`, { headers: cookieFor(seed.admin) });
    expect(res.status).toBe(413);
    const ok = await fetch(`${server.url}/api/admin/export/appointments?startDate=2030-01-01&endDate=2030-01-02`, { headers: cookieFor(seed.admin) });
    expect(ok.status).toBe(200);
  });

  test("la IP registrada no se puede falsificar con x-forwarded-for ni rompe el registro", async () => {
    await fetch(`${server.url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "6.6.6.6, " + "9".repeat(80) },
      body: JSON.stringify({ email: seed.clientA.email, password: "password123" }),
    });
    const row = await waitFor(async () => (await sql`select ip_address from audit_logs where action = 'LOGIN'`)[0]);
    expect(row.ip_address).not.toContain("6.6.6.6");
    expect(String(row.ip_address).length).toBeLessThanOrEqual(50);
    expect(String(row.ip_address)).toMatch(/127\.0\.0\.1|::1/);
  });

  test("logAudit trunca una IP demasiado larga en lugar de perder el evento", async () => {
    await logAudit({ action: "TEST_LONG_IP", entityType: "x", ipAddress: "1".repeat(200) });
    const row = await waitFor(async () => (await sql`select ip_address from audit_logs where action = 'TEST_LONG_IP'`)[0]);
    expect(String(row.ip_address)).toHaveLength(50);
  });

  test("login exitoso y fallido, registro y logout-all quedan auditados", async () => {
    const post = (path: string, body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
      fetch(`${server.url}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    await post("/api/auth/login", { email: seed.clientA.email, password: "password123" });
    await post("/api/auth/login", { email: seed.clientA.email, password: "incorrecta" });
    await post("/api/auth/login", { email: "no-existe@test.cl", password: "x" });
    await sql`update users set is_active = false where id = ${seed.clientB.id}`;
    await post("/api/auth/login", { email: seed.clientB.email, password: "password123" });
    await post("/api/auth/register", { name: "Nueva Persona", rut: makeValidRut(89), phone: "+56 9 1111 2222", email: "nueva@test.cl", password: "clave1234" });
    await post("/api/auth/logout-all", {}, cookieFor(seed.mechanic));

    await waitFor(async () => ((await actionsLogged()).length >= 6 ? true : undefined));
    const actions = await actionsLogged();
    for (const expected of ["LOGIN", "LOGIN_FAILED", "LOGIN_BLOCKED", "USER_REGISTER", "LOGOUT_ALL"]) {
      expect(actions).toContain(expected);
    }
    expect(actions.filter((a) => a === "LOGIN_FAILED")).toHaveLength(2);
    // los fallos nunca guardan la contraseña
    const details = await sql`select details from audit_logs where action like 'LOGIN%'`;
    expect(JSON.stringify(details)).not.toContain("incorrecta");
  });
});
