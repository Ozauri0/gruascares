import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./connection.js";

async function runMigrations() {
  console.log("⚡ Ejecutando migraciones de PostgreSQL con Drizzle...");
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✅ Migraciones aplicadas correctamente.");
  } catch (error) {
    console.error("❌ Error aplicando migraciones:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
