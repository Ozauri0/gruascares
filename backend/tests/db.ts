import { hashPassword } from "../src/utils/password.js";
import { sql as rawSql, db } from "../src/db/connection.js";
import { users, services, vehicles } from "../src/db/schema.js";
import { generateToken } from "../src/utils/jwt.js";

export const dbReady: boolean = Boolean((globalThis as any).__TEST_DB_READY__);

export async function resetDb(): Promise<void> {
  await rawSql.unsafe(
    "truncate table password_reset_tokens, custom_time_slots, products, audit_logs, blocked_dates, service_records, appointments, vehicles, services, users restart identity cascade"
  );
}

export interface Seed {
  admin: typeof users.$inferSelect;
  mechanic: typeof users.$inferSelect;
  clientA: typeof users.$inferSelect;
  clientB: typeof users.$inferSelect;
  serviceGrua: typeof services.$inferSelect;
  serviceAceite: typeof services.$inferSelect;
  vehicleA: typeof vehicles.$inferSelect;
  vehicleB: typeof vehicles.$inferSelect;
}

/** Datos mínimos y deterministas para las pruebas de integración. */
export async function seedBasics(): Promise<Seed> {
  const hash = await hashPassword("password123");
  const [admin, mechanic, clientA, clientB] = await db
    .insert(users)
    .values([
      { name: "Admin Test", email: "admin@test.local", passwordHash: hash, role: "admin" },
      { name: "Mecanico Test", email: "mecanico@test.local", passwordHash: hash, role: "mecanico" },
      { name: "Cliente A", email: "a@test.local", passwordHash: hash, role: "usuario" },
      { name: "Cliente B", email: "b@test.local", passwordHash: hash, role: "usuario" },
    ])
    .returning();
  const [serviceGrua, serviceAceite] = await db
    .insert(services)
    .values([
      { category: "grua", name: "Grúa Test", basePrice: 45000, estimatedDurationMin: 60 },
      { category: "serviteca", name: "Aceite Test", basePrice: 35000, estimatedDurationMin: 45 },
    ])
    .returning();
  const [vehicleA, vehicleB] = await db
    .insert(vehicles)
    .values([
      { userId: clientA.id, plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021, mileage: 1000 },
      { userId: clientB.id, plate: "WXYZ99", brand: "Ford", model: "Ranger", year: 2020, mileage: 2000 },
    ])
    .returning();
  return { admin, mechanic, clientA, clientB, serviceGrua, serviceAceite, vehicleA, vehicleB };
}

export function cookieFor(user: { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario"; tokenVersion?: number }): Record<string, string> {
  const token = generateToken({ userId: user.id, email: user.email, name: user.name, role: user.role, tokenVersion: user.tokenVersion ?? 0 });
  return { Cookie: `gc_token=${token}`, "Content-Type": "application/json" };
}

/** Fecha futura (YYYY-MM-DD) a N días desde hoy. */
export function futureDate(days = 7): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
