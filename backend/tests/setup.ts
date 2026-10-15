// Entorno aislado para pruebas: nunca usar SMTP real, secretos de .env ni la BD de desarrollo.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";

process.env.BCRYPT_ROUNDS = "4";
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.JWT_SECRET = "test_secret_test_secret_test_secret_123456";
process.env.CORS_ORIGIN = "http://localhost:3000";

const baseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgrespassword@localhost:5432/gruas_cares";
const TEST_DB = "gruas_cares_test";
const testUrl = process.env.DATABASE_URL_TEST || baseUrl.replace(/\/[^/?]+(\?.*)?$/, `/${TEST_DB}$1`);
process.env.DATABASE_URL = testUrl;

(globalThis as any).__TEST_DB_READY__ = false;
try {
  const adminUrl = testUrl.replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");
  const admin = postgres(adminUrl, { max: 1, connect_timeout: 3 });
  const dbName = new URL(testUrl).pathname.slice(1);
  // BD de pruebas siempre limpia: se recrea en cada ejecución.
  await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${dbName} and pid <> pg_backend_pid()`;
  await admin.unsafe(`drop database if exists "${dbName}"`);
  await admin.unsafe(`create database "${dbName}"`);
  await admin.end();

  // Se aplican las migraciones reales (así se detecta cualquier desfase entre schema.ts y drizzle/).
  const client = postgres(testUrl, { max: 1, connect_timeout: 3 });
  await migrate(drizzle(client), { migrationsFolder: path.resolve(import.meta.dir, "../drizzle") });
  await client.end();
  (globalThis as any).__TEST_DB_READY__ = true;
} catch (error) {
  console.warn("⚠️  Base de datos de pruebas no disponible: se omiten las pruebas que la requieren.", (error as Error).message);
}
