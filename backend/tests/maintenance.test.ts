import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { purgeAuditLogs, purgeRevokedTokens, purgeUnverifiedAccounts, runMaintenance } from "../src/services/maintenance.js";
import { makeValidRut } from "../src/utils/rut.js";
import { dbReady, resetDb, seedBasics } from "./db.js";

beforeAll(async () => {});
afterAll(async () => {});
beforeEach(async () => {
  if (!dbReady) return;
  await resetDb();
  await seedBasics();
});

describe.skipIf(!dbReady)("limpieza periódica", () => {
  test("el registro de actividad conserva 12 meses y borra solo lo más antiguo", async () => {
    await sql`insert into audit_logs (action, entity_type, created_at) values
      ('VIEJO', 'x', now() - interval '13 months'),
      ('LIMITE', 'x', now() - interval '11 months 20 days'),
      ('RECIENTE', 'x', now() - interval '2 days')`;
    expect(await purgeAuditLogs(12)).toBe(1);
    const rows = await sql`select action from audit_logs order by action`;
    expect(rows.map((r) => r.action)).toEqual(["LIMITE", "RECIENTE"]);
    expect(await purgeAuditLogs(12)).toBe(0); // idempotente
  });

  test("elimina cuentas sin confirmar vencidas, no las confirmadas, las del equipo, los perfiles presenciales ni las que tienen enlace vigente", async () => {
    let idx = 600;
    const mk = async (email: string | null, opts: { verified?: boolean; role?: string; ageHours: number; hasPassword?: boolean }) => {
      const [u] = await sql`insert into users (name, rut, phone, email, password_hash, role, created_at, email_verified_at)
        values (${email ?? "Presencial"}, ${makeValidRut(idx++)}, '+56 9 1111 2222', ${email}, ${opts.hasPassword === false ? null : "x"}, ${opts.role ?? "usuario"}, now() - make_interval(hours => ${opts.ageHours}), ${opts.verified ? sql`now()` : null}) returning id`;
      return u.id as string;
    };
    const stale = await mk("vencida@test.local", { ageHours: 30 });
    const fresh = await mk("reciente@test.local", { ageHours: 3 });
    const confirmed = await mk("confirmada@test.local", { verified: true, ageHours: 400 });
    const staff = await mk("equipo@test.local", { role: "mecanico", verified: true, ageHours: 400 });
    const walkIn = await mk("presencial@test.local", { ageHours: 400, hasPassword: false });
    const resent = await mk("reenviada@test.local", { ageHours: 30 }); // pidió otro enlace hace poco
    await sql`insert into email_verification_tokens (user_id, token_hash, expires_at) values (${resent}, 'h1', now() + interval '2 hours')`;
    const expiredToken = await mk("tokenvencido@test.local", { ageHours: 30 });
    await sql`insert into email_verification_tokens (user_id, token_hash, expires_at) values (${expiredToken}, 'h2', now() - interval '1 hour')`;

    expect(await purgeUnverifiedAccounts()).toBe(2); // vencida + tokenvencido
    const left = (await sql`select email from users where email like '%@test.local' and email in ('vencida@test.local','reciente@test.local','confirmada@test.local','equipo@test.local','presencial@test.local','reenviada@test.local','tokenvencido@test.local')`).map((r) => r.email).sort();
    expect(left).toEqual(["confirmada@test.local", "equipo@test.local", "presencial@test.local", "reciente@test.local", "reenviada@test.local"]);
    expect(stale && fresh && confirmed && staff && walkIn).toBeTruthy();
    // el correo vuelve a quedar libre para registrarse
    expect((await sql`select 1 from users where email = 'vencida@test.local'`).length).toBe(0);
  });

  test("las sesiones revocadas vencidas se descartan", async () => {
    await sql`insert into revoked_tokens (jti, expires_at) values ('a', now() - interval '1 day'), ('b', now() + interval '1 day')`;
    expect(await purgeRevokedTokens()).toBe(1);
    expect((await sql`select jti from revoked_tokens`).map((r) => r.jti)).toEqual(["b"]);
  });

  test("runMaintenance junta todo y deja constancia cuando eliminó algo", async () => {
    await sql`insert into audit_logs (action, entity_type, created_at) values ('VIEJO', 'x', now() - interval '20 months')`;
    const result = await runMaintenance();
    expect(result.auditLogs).toBe(1);
    for (let i = 0; i < 40; i++) {
      if ((await sql`select 1 from audit_logs where action = 'MAINTENANCE_PURGE'`).length) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("falta el registro de la limpieza");
  });
});
