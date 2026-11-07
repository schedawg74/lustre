import type { RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { sendError } from "./errors";

export type RateLimits = {
  // Requests per minute and IP address on every /v1 route.
  perIp: number;
  // New installs per hour and IP address.
  installsPerIp: number;
  // Requests per minute and install token.
  perToken: number;
};

export const DEFAULT_RATE_LIMITS: RateLimits = {
  installsPerIp: 10,
  perIp: 120,
  perToken: 60,
};

const limiter = (
  limit: number,
  windowMs: number,
  key: (...args: Parameters<RequestHandler>) => string
): RequestHandler =>
  rateLimit({
    handler: (_req, res) => {
      sendError(res, 429, "RATE_LIMITED", "Too many requests");
    },
    keyGenerator: (req, res) => key(req, res, () => undefined),
    legacyHeaders: false,
    limit,
    standardHeaders: "draft-8",
    windowMs,
  });

const byIp = (...[req]: Parameters<RequestHandler>) =>
  ipKeyGenerator(req.ip ?? "unknown");

export const limitPerIp = (limit: number) => limiter(limit, 60_000, byIp);

export const limitInstallsPerIp = (limit: number) =>
  limiter(limit, 60 * 60_000, byIp);

// Mount after requireInstall.
export const limitPerToken = (limit: number) =>
  limiter(
    limit,
    60_000,
    (_req, res) => `install:${String(res.locals.installId)}`
  );
