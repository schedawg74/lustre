import type { Database } from "@lustre/db";
import { createBlocklistService } from "./blocklist";
import { createInstallService } from "./installs";
import { createReportService } from "./reports";

export const createServices = (db: Database, now = () => new Date()) => ({
  blocklist: createBlocklistService(db),
  installs: createInstallService(db, now),
  reports: createReportService(db, now),
});

export type Services = ReturnType<typeof createServices>;
