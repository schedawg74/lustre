import { fileURLToPath } from "node:url";
import { openDatabase, runMigrations } from "./index";

const migrationsFolder = fileURLToPath(
  new URL("../migrations", import.meta.url)
);

// An in-memory database with every migration applied. For tests only.
export const createTestDatabase = () => {
  const database = openDatabase(":memory:");
  runMigrations(database.db, migrationsFolder);
  return database;
};
