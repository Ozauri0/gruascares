import { beforeAll, describe, expect, test } from "bun:test";
import { dbReady, resetDb, seedBasics } from "./db.js";

describe.skipIf(!dbReady)("infraestructura de pruebas con BD", () => {
  beforeAll(async () => {
    await resetDb();
  });
  test("la BD de pruebas permite sembrar datos mínimos", async () => {
    const seed = await seedBasics();
    expect(seed.admin.role).toBe("admin");
    expect(seed.vehicleA.userId).toBe(seed.clientA.id);
  });
});
