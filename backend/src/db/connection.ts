import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config/env.js";
import * as schema from "./schema.js";

// Cliente de conexión para consultas normales
export const sql = postgres(config.databaseUrl, {
  max: config.nodeEnv === "production" ? 10 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Instancia de Drizzle tipada con nuestro esquema
export const db = drizzle(sql, { schema });
