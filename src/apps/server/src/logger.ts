import { type Logger, pino } from "pino";

export type { Logger } from "pino";

export const createLogger = (level: string): Logger =>
  pino({
    base: { service: "lustre-server" },
    level,
    // The bearer token identifies an install. It never goes into a log.
    redact: ["req.headers.authorization", "headers.authorization"],
  });
