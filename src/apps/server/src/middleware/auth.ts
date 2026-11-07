import type { RequestHandler, Response } from "express";
import { sendError } from "./errors";

// 32 random bytes in base64url.
const BEARER = /^Bearer ([\w-]{43})$/;

export const requireInstall =
  (authenticate: (token: string) => string | undefined): RequestHandler =>
  (req, res, next) => {
    const token = BEARER.exec(req.get("authorization") ?? "")?.[1];
    const installId = token === undefined ? undefined : authenticate(token);
    if (installId === undefined) {
      sendError(res, 401, "UNAUTHORIZED", "A valid install token is required");
      return;
    }
    res.locals.installId = installId;
    next();
  };

export const installIdOf = (res: Response): string => {
  const { installId } = res.locals;
  if (typeof installId !== "string") {
    throw new Error("The route does not use requireInstall");
  }
  return installId;
};
