import { defineConfig } from "drizzle-kit";

export default defineConfig({
  casing: "snake_case",
  dialect: "sqlite",
  out: "./migrations",
  schema: "./src/schema.ts",
});
