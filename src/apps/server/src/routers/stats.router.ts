import { type RequestHandler, Router } from "express";
import type { Services } from "../services";

// Public, for the landing page. The service caches for the same minute.
export const createStatsRouter = (services: Services, limit: RequestHandler) =>
  Router().get("/stats", limit, (_req, res) => {
    res.set("cache-control", "public, max-age=60");
    res.json(services.stats.get());
  });
