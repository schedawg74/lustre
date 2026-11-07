/**
 * Calls the same REST endpoints the x.com web app calls when you block or mute
 * someone from a profile. Run it from a page on x.com (a content script): the
 * request then carries your session cookies, and the `ct0` cookie supplies the
 * CSRF token.
 */

/** The bearer token that x.com's own web bundle sends with every API call. */
export const WEB_APP_BEARER =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const DEFAULT_RATE_LIMIT_WAIT_MS = 15 * 60 * 1000;

/** X returned 429. `resetAt` is when the limit window ends (epoch ms). */
export class XRateLimitError extends Error {
  readonly resetAt: number;
  constructor(resetAt: number) {
    super(`X rate limit reached until ${new Date(resetAt).toISOString()}`);
    this.name = "XRateLimitError";
    this.resetAt = resetAt;
  }
}

/** The session is missing or X refused it. Stop and ask the user to log in. */
export class XAuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "XAuthError";
    this.status = status;
  }
}

/** The target account is gone (suspended, deactivated, renamed away). */
export class XTargetUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XTargetUnavailableError";
  }
}

/** Any other failed request. `retryable` is true for 5xx and network errors. */
export class XRequestError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, options: { status: number; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "XRequestError";
    const { status } = options;
    this.status = status;
    this.retryable = status === 0 || status >= 500;
  }
}

/** Identifies an account by numeric id or by @handle (without the @). */
export type XUserRef = { userId: string } | { screenName: string };

export type XClientOptions = {
  /** `https://x.com` or `https://twitter.com`: the origin of the open page. */
  origin: string;
  fetch: typeof fetch;
  /** Reads the `ct0` cookie on every call, so a refreshed session works. */
  getCsrfToken: () => string | undefined;
  /** The bearer header x.com currently sends, if one was seen. */
  getAuthorization?: () => string | undefined;
  language?: string;
  now?: () => number;
};

// X error codes: https://developer.x.com/en/support/x-api/error-troubleshooting
const TARGET_GONE_CODES = new Set([17, 34, 50, 63]);
const SESSION_CODES = new Set([32, 89, 215, 326, 353]);
const RATE_LIMIT_CODE = 88;

const readErrorCodes = (body: unknown): number[] => {
  if (typeof body !== "object" || body === null || !("errors" in body)) {
    return [];
  }
  const { errors } = body as { errors: unknown };
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .map((error: unknown) =>
      typeof error === "object" && error !== null && "code" in error
        ? Number((error as { code: unknown }).code)
        : Number.NaN
    )
    .filter((code) => Number.isFinite(code));
};

const parseBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    // An empty or non-JSON body carries no error codes.
  }
};

const describeCodes = (codes: number[]) =>
  codes.length > 0 ? ` (X error ${codes.join(", ")})` : "";

/** Turns a failed response into the error class the caller acts on. */
const toError = async (response: Response, now: () => number) => {
  const codes = readErrorCodes(await parseBody(response));
  const { status } = response;
  if (status === 429 || codes.includes(RATE_LIMIT_CODE)) {
    const resetHeader = Number(response.headers.get("x-rate-limit-reset"));
    const resetAt =
      Number.isFinite(resetHeader) && resetHeader > 0
        ? resetHeader * 1000
        : now() + DEFAULT_RATE_LIMIT_WAIT_MS;
    return new XRateLimitError(resetAt);
  }
  if (codes.some((code) => TARGET_GONE_CODES.has(code))) {
    return new XTargetUnavailableError(
      `Account unavailable${describeCodes(codes)}.`
    );
  }
  if (status === 401 || codes.some((code) => SESSION_CODES.has(code))) {
    return new XAuthError(
      status,
      `X refused the session: HTTP ${status}${describeCodes(codes)}.`
    );
  }
  if (status === 404) {
    return new XTargetUnavailableError("Account not found.");
  }
  return new XRequestError(
    `X answered HTTP ${status}${describeCodes(codes)}.`,
    { status }
  );
};

export const createXClient = (options: XClientOptions) => {
  const now = options.now ?? Date.now;

  const post = async (path: string, form: Record<string, string>) => {
    const csrf = options.getCsrfToken();
    if (!csrf) {
      throw new XAuthError(0, "Not logged in to X (no ct0 cookie).");
    }
    let response: Response;
    try {
      response = await options.fetch(`${options.origin}/i/api/1.1/${path}`, {
        body: new URLSearchParams(form).toString(),
        credentials: "include",
        headers: {
          authorization: options.getAuthorization?.() ?? WEB_APP_BEARER,
          "content-type": "application/x-www-form-urlencoded",
          "x-csrf-token": csrf,
          "x-twitter-active-user": "yes",
          "x-twitter-auth-type": "OAuth2Session",
          "x-twitter-client-language": options.language ?? "en",
        },
        method: "POST",
      });
    } catch (error) {
      throw new XRequestError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error, status: 0 }
      );
    }
    if (!response.ok) {
      throw await toError(response, now);
    }
    return parseBody(response);
  };

  const toForm = (ref: XUserRef): Record<string, string> =>
    "userId" in ref ? { user_id: ref.userId } : { screen_name: ref.screenName };

  return {
    block: (ref: XUserRef) => post("blocks/create.json", toForm(ref)),
    mute: (ref: XUserRef) => post("mutes/users/create.json", toForm(ref)),
    unblock: (ref: XUserRef) => post("blocks/destroy.json", toForm(ref)),
    unmute: (ref: XUserRef) => post("mutes/users/destroy.json", toForm(ref)),
  };
};

export type XClient = ReturnType<typeof createXClient>;
