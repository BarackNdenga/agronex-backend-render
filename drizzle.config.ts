import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/pg-migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Schema generation does not connect; this fallback keeps local generation usable.
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:54322/postgres",
  },
});
