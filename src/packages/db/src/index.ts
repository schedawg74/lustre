import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Sqlite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { accounts, installs, lists, reports } from "./schema";

const schema = { accounts, installs, lists, reports };

export const openDatabase = (path: string) => {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Sqlite(path);
  // WAL lets readers run during a write, and Litestream replicates the WAL.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle({ casing: "snake_case", client: sqlite, schema });
  return { close: () => sqlite.close(), db };
};

export type Database = ReturnType<typeof openDatabase>["db"];

// Applies the SQL files of `migrationsFolder` in order. Drizzle records each
// applied file, so a second run applies nothing.
export const runMigrations = (db: Database, migrationsFolder: string) => {
  migrate(db, { migrationsFolder });
};

export {
  accounts,
  installs,
  lists,
  REPORT_ACTIONS,
  REPORT_SOURCES,
  reports,
} from "./schema";
