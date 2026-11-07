import { openDatabase, runMigrations } from "@lustre/db";
import { createApp } from "./app";
import { parseServerEnv } from "./config";
import { createLogger } from "./logger";
import { createServices } from "./services";

const env = parseServerEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const database = openDatabase(env.DATABASE_PATH);
runMigrations(database.db, env.MIGRATIONS_FOLDER);
logger.info("Migrations applied");

const app = createApp({
  logger,
  services: createServices(database.db),
  trustProxyHops: env.TRUST_PROXY_HOPS,
});
const server = app.listen(env.PORT, (error) => {
  if (error) {
    throw error;
  }
  logger.info({ port: env.PORT }, "Server listening");
});

const shutdown = (signal: NodeJS.Signals) => {
  logger.info({ signal }, "Shutting down");
  server.close(() => {
    database.close();
  });
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
