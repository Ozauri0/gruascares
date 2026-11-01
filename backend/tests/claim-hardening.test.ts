import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { phoneKey } from "../src/utils/phone.js";
import { makeValidRut } from "../src/utils/rut.js";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe("comparación de teléfonos", () => {
  test("ignora el formato y el prefijo del país", () => {
    const variants = ["+56 9 1234 5678", "912345678", "9 1234-5678", "(56) 9 12345678", "+56912345678"];
    for (const v of variants) expect(phoneKey(v)).toBe("12345678");
    expect(phoneKey("+56 9 1234 5679")).not.toBe(phoneKey("+56 9 1234 5678"));
    expect(phoneKey("123")).toBe("");
    expect(phoneKey(undefined)).toBe("");
  });
});

describe.skipIf(!dbReady)("reclamo de perfiles presenciales: teléfono, límite y registro (#133)", () => {
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

  const post = async (path: string, body: unknown, user?: Seed["admin"]) => {
    const res = await fetch(`${server.url}${path}`, { method: "POST", headers: user ? cookieFor(user) : { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };
  const rut = makeValidRut(960);
  const register = (over: Record<string, unknown> = {}) =>
    post("/api/auth/register", { name: "Juan Pérez", rut, email: "juan@example.com", phone: "+56 9 5555 0960", password: "ClaveSegura123!", ...over });
  const walkIn = async () => {
    expect((await post("/api/clients", { name: "Juan Pérez", rut, phone: "+56 9 5555 0960" }, seed.seller)).status).toBe(201);
    const [{ id }] = await sql`select id from users where rut = ${rut}`;
    await sql`insert into vehicles (user_id, plate, brand, model, year, mileage) values (${id}, 'KLMN34', 'Chevrolet', 'D-Max', 2022, 15000)`;
    return id as string;
  };
  const audit = async (action: string) => {
    for (let i = 0; i < 40; i++) {
      const rows = await sql`select details from audit_logs where action = ${action} order by created_at`;
      if (rows.length) return rows.map((r) => JSON.parse(r.details as string));
      await new Promise((r) => setTimeout(r, 25));
    }
    return [];
  };

  test("con otro teléfono no se reclama el perfil, y la respuesta es la misma que para un RUT con cuenta", async () => {
    const id = await walkIn();
    const wrong = await register({ phone: "+56 9 1111 2222" });
    expect(wrong.status).toBe(409);
    expect(wrong.body.claimed).toBeUndefined();

    // Un RUT que sí tiene cuenta responde exactamente igual: no se puede saber qué RUT tienen perfil.
    const withAccount = await register({ rut: seed.clientA.rut, email: "otra@example.com" });
    expect(withAccount.status).toBe(409);
    expect(withAccount.body).toEqual(wrong.body);

    const [profile] = await sql`select password_hash, email from users where id = ${id}`;
    expect(profile.password_hash).toBeNull();
    expect(profile.email).toBeNull();
    expect((await audit("PROFILE_CLAIM_REJECTED"))[0]).toMatchObject({ rut, reason: "phone_mismatch" });
  });

  test("con el teléfono del local (en cualquier formato) se reclama y se conserva el historial", async () => {
    const id = await walkIn();
    const claimed = await register({ phone: "9 5555-0960" });
    expect(claimed.status).toBe(201);
    expect(claimed.body.claimed).toBe(true);
    expect(claimed.body.user.id).toBe(id);
    const [{ n }] = await sql`select count(*)::int as n from vehicles where user_id = ${id}`;
    expect(n).toBe(1);
    // Queda a la vista del personal que se reclamó un perfil con historial.
    expect((await audit("PROFILE_CLAIMED"))[0]).toMatchObject({ rut, vehicles: 1, appointments: 0 });
    const log = await (await fetch(`${server.url}/api/admin/audit-logs?level=warn`, { headers: cookieFor(seed.admin) })).json() as any;
    expect(log.logs.map((l: any) => l.action)).toContain("PROFILE_CLAIMED");
  });

  test("un perfil sin teléfono utilizable no se puede reclamar", async () => {
    const id = await walkIn();
    await sql`update users set phone = '123456' where id = ${id}`;
    expect((await register({ phone: "123456" })).status).toBe(409);
  });

  test("los intentos por RUT tienen tope, aunque cambien el correo o el teléfono", async () => {
    const limited = await startServer({ rateLimits: { registerPerRut: { windowMs: 60_000, max: 6 } } });
    const register = (over: Record<string, unknown> = {}) =>
      fetch(`${limited.url}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Juan Pérez", rut, email: "juan@example.com", phone: "+56 9 5555 0960", password: "ClaveSegura123!", ...over }),
      }).then(async (res) => ({ status: res.status, body: (await res.json()) as any }));
    await walkIn();
    try {
    for (let i = 0; i < 6; i++) {
      expect((await register({ email: `intento${i}@example.com`, phone: `+56 9 2000 000${i}` })).status).toBe(409);
    }
    const blocked = await register({ email: "intento7@example.com", phone: "+56 9 5555 0960" });
    expect(blocked.status).toBe(429); // ni siquiera con el teléfono correcto: hay que esperar
    expect(blocked.body.message).toContain("RUT");
    // Otro RUT no se ve afectado
    expect((await register({ rut: makeValidRut(961), email: "nuevo@example.com" })).status).toBe(201);
    } finally {
      await limited.close();
    }
  });
});
