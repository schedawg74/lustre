import { Router } from "express";
import { requireInstall } from "../middleware/auth";
import {
  limitPerIp,
  limitPerToken,
  limitStatsPerIp,
  type RateLimits,
} from "../middleware/rate-limit";
import type { Services } from "../services";
import { createBlocklistRouter } from "./blocklist.router";
import { createInstallsRouter } from "./installs.router";
import { createListsRouter } from "./lists.router";
import { createReportsRouter } from "./reports.router";
import { createStatsRouter } from "./stats.router";

export { createHealthRouter } from "./health.router";

export const createV1Router = (services: Services, limits: RateLimits) => {
  const guards = [
    requireInstall(services.installs.authenticate),
    limitPerToken(limits.perToken),
  ];
  return Router()
    .use(limitPerIp(limits.perIp))
    .use(createInstallsRouter(services, limits.installsPerIp))
    .use(createStatsRouter(services, limitStatsPerIp(limits.statsPerIp)))
    .use(createReportsRouter(services, guards))
    .use(createBlocklistRouter(services, guards))
    .use(createListsRouter(services, guards));
};
