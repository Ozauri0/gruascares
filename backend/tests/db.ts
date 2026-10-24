import { hashPassword } from "../src/utils/password.js";
import { sql as rawSql, db } from "../src/db/connection.js";
import { users, services, vehicles } from "../src/db/schema.js";
import { generateToken } from "../src/utils/jwt.js";
import { makeValidRut } from "../src/utils/rut.js";

export const dbReady: boolean = Boolean((globalThis as any).__TEST_DB_READY__);

export async function resetDb(): Promise<void> {
  await rawSql.unsafe(
    "truncate table revoked_tokens, email_verification_tokens, password_reset_tokens, custom_time_slots, site_content, products, audit_logs, blocked_dates, service_records, appointments, vehicles, services, users restart identity cascade"
  );
}

export type SeedUser = typeof users.$inferSelect & { email: string };

export interface Seed {
  admin: SeedUser;
  mechanic: SeedUser;
  clientA: SeedUser;
  clientB: SeedUser;
  serviceGrua: typeof services.$inferSelect;
  serviceAceite: typeof services.$inferSelect;
  seller: SeedUser;
  vehicleA: typeof vehicles.$inferSelect;
  vehicleB: typeof vehicles.$inferSelect;
}

/** Datos mínimos y deterministas para las pruebas de integración. */
export async function seedBasics(): Promise<Seed> {
  const hash = await hashPassword("password123");
  const [admin, mechanic, clientA, clientB, seller] = (await db
    .insert(users)
    .values([
      { name: "Admin Test", rut: makeValidRut(1), phone: "+56 9 1000 0001", email: "admin@test.local", passwordHash: hash, role: "admin", emailVerifiedAt: new Date() },
      { name: "Mecanico Test", rut: makeValidRut(2), phone: "+56 9 1000 0002", email: "mecanico@test.local", passwordHash: hash, role: "mecanico", emailVerifiedAt: new Date() },
      { name: "Cliente A", rut: makeValidRut(3), phone: "+56 9 1000 0003", email: "a@test.local", passwordHash: hash, role: "usuario", emailVerifiedAt: new Date() },
      { name: "Cliente B", rut: makeValidRut(4), phone: "+56 9 1000 0004", email: "b@test.local", passwordHash: hash, role: "usuario", emailVerifiedAt: new Date() },
      { name: "Vendedor Test", rut: makeValidRut(5), phone: "+56 9 1000 0005", email: "vendedor@test.local", passwordHash: hash, role: "vendedor", emailVerifiedAt: new Date() },
    ])
    .returning()) as SeedUser[];
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
  return { admin, mechanic, seller, clientA, clientB, serviceGrua, serviceAceite, vehicleA, vehicleB };
}

export function cookieFor(user: { id: string; email: string | null; name: string; role: "admin" | "mecanico" | "usuario" | "vendedor"; tokenVersion?: number }): Record<string, string> {
  const token = generateToken({ userId: user.id, email: user.email ?? "", name: user.name, role: user.role, tokenVersion: user.tokenVersion ?? 0 });
  return { Cookie: `gc_token=${token}`, "Content-Type": "application/json" };
}

/** Fecha futura (YYYY-MM-DD) a N días desde hoy. */
export function futureDate(days = 7): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Crea `count` clientes con correo confirmado (para pruebas con muchas personas distintas a la vez). */
export async function createClients(count: number): Promise<SeedUser[]> {
  const hash = await hashPassword("password123");
  return (await db
    .insert(users)
    .values(
      Array.from({ length: count }, (_, i) => ({
        name: `Cliente ${i}`,
        rut: makeValidRut(100 + i),
        phone: `+56 9 2000 ${String(i).padStart(4, "0")}`,
        email: `cliente${i}@test.local`,
        passwordHash: hash,
        role: "usuario" as const,
        emailVerifiedAt: new Date(),
      }))
    )
    .returning()) as SeedUser[];
}
