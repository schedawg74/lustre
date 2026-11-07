import type { Database } from "@lustre/db";
import { createBlocklistService } from "./blocklist";
import { createInstallService } from "./installs";
import { createListService } from "./lists";
import { createReportService } from "./reports";
import { createStatsService } from "./stats";

export const createServices = (db: Database, now = () => new Date()) => ({
  blocklist: createBlocklistService(db),
  installs: createInstallService(db, now),
  lists: createListService(db),
  reports: createReportService(db, now),
  stats: createStatsService(db, now),
});

export type Services = ReturnType<typeof createServices>;
