import { defineConfig } from "drizzle-kit";
import { config } from "./src/config/env.js";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: config.databaseUrl,
  },
  verbose: true,
  strict: true,
});
