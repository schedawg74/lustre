import type { ErrorResponse } from "@lustre/api/v1";
import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import type { Logger } from "../logger";

export const sendError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  issues?: ErrorResponse["error"]["issues"]
) => {
  const body: ErrorResponse = { error: { code, issues, message } };
  res.status(status).json(body);
};

export const notFound: RequestHandler = (_req, res) => {
  sendError(res, 404, "NOT_FOUND", "Not found");
};

// Body parser errors carry `expose` and a 4xx status, for example invalid JSON
// or a body above the limit.
const toClientError = (error: unknown) => {
  if (typeof error !== "object" || error === null) {
    return;
  }
  const { expose, status, type } = error as {
    expose?: unknown;
    status?: unknown;
    type?: unknown;
  };
  if (expose !== true || typeof status !== "number" || status >= 500) {
    return;
  }
  const code =
    type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST";
  return { code, status };
};

export const handleErrors =
  (logger: Logger): ErrorRequestHandler =>
  (error: unknown, _req, res, _next) => {
    if (error instanceof ZodError) {
      sendError(
        res,
        400,
        "INVALID_REQUEST",
        "The request is not valid",
        error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        }))
      );
      return;
    }
    const clientError = toClientError(error);
    if (clientError) {
      sendError(res, clientError.status, clientError.code, "Bad request");
      return;
    }
    logger.error({ err: error }, "Request failed");
    sendError(res, 500, "INTERNAL", "Internal server error");
  };
