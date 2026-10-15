import { beforeAll, describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../src/db/schema.js";
import { dbReady, resetDb } from "./db.js";
import { sql } from "../src/db/connection.js";

async function expectFails(run: () => PromiseLike<unknown>): Promise<void> {
  let failed = false;
  try {
    await run();
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}

describe.skipIf(!dbReady)("BUG-3: migraciones alineadas con schema.ts", () => {
  beforeAll(async () => {
    await resetDb();
  });

  test("todas las tablas del esquema existen tras aplicar las migraciones", async () => {
    const expected = Object.values(schema)
      .map((value) => {
        try {
          return getTableConfig(value as never).name;
        } catch {
          return null;
        }
      })
      .filter((name): name is string => Boolean(name));
    expect(expected).toContain("blocked_dates");
    expect(expected).toContain("audit_logs");

    const rows = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const existing = new Set(rows.map((r) => r.table_name as string));
    for (const table of expected) expect(existing.has(table)).toBe(true);
  });

  test("no se puede duplicar la patente de un mismo usuario", async () => {
    const [user] = await sql`insert into users (name, email, password_hash) values ('U', 'u@t.cl', 'x') returning id`;
    await sql`insert into vehicles (user_id, plate, brand, model) values (${user.id}, 'ABCD12', 'a', 'b')`;
    await expectFails(() => sql`insert into vehicles (user_id, plate, brand, model) values (${user.id}, 'ABCD12', 'a', 'b')`);
  });

  test("no se puede duplicar un bloqueo, incluido el de día completo (time_slot nulo)", async () => {
    await sql`insert into blocked_dates (date, reason) values ('2030-01-01', 'feriado')`;
    await expectFails(() => sql`insert into blocked_dates (date, reason) values ('2030-01-01', 'otra vez')`);
    await sql`insert into blocked_dates (date, time_slot, reason) values ('2030-01-01', '10:30', 'bloque')`;
    await expectFails(() => sql`insert into blocked_dates (date, time_slot, reason) values ('2030-01-01', '10:30', 'dup')`);
  });
});
