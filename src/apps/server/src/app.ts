import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Logger } from "./logger";
import { handleErrors, notFound } from "./middleware/errors";
import { DEFAULT_RATE_LIMITS, type RateLimits } from "./middleware/rate-limit";
import { createHealthRouter, createV1Router } from "./routers";
import type { Services } from "./services";

export type AppOptions = {
  logger: Logger;
  services: Services;
  trustProxyHops: number;
  limits?: Partial<RateLimits>;
};

// 500 reports of about 200 bytes each, with room to spare.
const BODY_LIMIT = "256kb";

// Only the extension calls the API from a browser. Its background worker has
// host permissions and does not need CORS; extension pages do.
const EXTENSION_ORIGIN = /^(chrome|moz)-extension:\/\/[a-z0-9-]+$/;

export const createApp = ({
  logger,
  services,
  trustProxyHops,
  limits,
}: AppOptions) => {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxyHops === 0 ? false : trustProxyHops);
  // The API serves JSON only: no scripts, no frames, no embedding.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
        useDefaults: false,
      },
    })
  );
  app.use(
    pinoHttp({
      autoLogging: { ignore: (req) => req.url === "/health" },
      logger,
      // Method, path, status, and duration only. No IP address, no headers.
      serializers: {
        req: (req: { method: string; url: string }) => ({
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    })
  );
  app.use(
    cors({
      allowedHeaders: ["Authorization", "Content-Type"],
      maxAge: 600,
      methods: ["GET", "POST"],
      origin: EXTENSION_ORIGIN,
    })
  );
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(createHealthRouter());
  app.use(
    "/v1",
    createV1Router(services, { ...DEFAULT_RATE_LIMITS, ...limits })
  );
  app.use(notFound);
  app.use(handleErrors(logger));
  return app;
};
