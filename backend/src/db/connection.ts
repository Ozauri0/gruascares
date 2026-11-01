import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });
import * as schema from "./schema.js";

// Cliente de conexión para consultas normales
export const sql = postgres(process.env.DATABASE_URL || "", {
  max: (process.env.NODE_ENV || "production") === "production" ? 10 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Instancia de Drizzle tipada con nuestro esquema
export const db = drizzle(sql, { schema });
