import type { z } from "zod";
import {
  API_PATHS,
  type BlocklistQuery,
  blocklistResponseSchema,
  createInstallResponseSchema,
  errorResponseSchema,
  healthResponseSchema,
  type Report,
  reportBatchResponseSchema,
} from "./v1";

/** The server answered with an error status. `code` comes from the error body. */
export class LustreApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LustreApiError";
    this.status = status;
    this.code = code;
  }
}

export type LustreApiOptions = {
  /** For example `https://blocklist.example.com`. */
  baseUrl: string;
  fetch: typeof fetch;
  /** The install token from `createInstall`. Reports and the blocklist need it. */
  token?: string;
};

type RequestOptions = {
  method: "GET" | "POST";
  body?: unknown;
  authenticated: boolean;
};

export const createLustreApi = ({
  baseUrl,
  fetch: fetchFn,
  token,
}: LustreApiOptions) => {
  const origin = baseUrl.replace(/\/+$/, "");

  const request = async <T>(
    schema: z.ZodType<T>,
    path: string,
    { method, body, authenticated }: RequestOptions
  ): Promise<T> => {
    const headers: Record<string, string> = { accept: "application/json" };
    if (authenticated) {
      if (!token) {
        throw new Error("This Lustre API call needs an install token");
      }
      headers.authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    const response = await fetchFn(`${origin}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
    });
    // An error page of a proxy is not JSON.
    const json: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(json);
      if (parsed.success) {
        const { code, message } = parsed.data.error;
        throw new LustreApiError(response.status, code, message);
      }
      throw new LustreApiError(
        response.status,
        `HTTP_${response.status}`,
        `Lustre API returned ${response.status}`
      );
    }
    return schema.parse(json);
  };

  return {
    createInstall: () =>
      request(createInstallResponseSchema, API_PATHS.installs, {
        authenticated: false,
        method: "POST",
      }),
    getBlocklist: (query: BlocklistQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      const search = params.size > 0 ? `?${params.toString()}` : "";
      return request(
        blocklistResponseSchema,
        `${API_PATHS.blocklist}${search}`,
        {
          authenticated: true,
          method: "GET",
        }
      );
    },
    health: () =>
      request(healthResponseSchema, API_PATHS.health, {
        authenticated: false,
        method: "GET",
      }),
    sendReports: (reports: Report[]) =>
      request(reportBatchResponseSchema, API_PATHS.reports, {
        authenticated: true,
        body: { reports },
        method: "POST",
      }),
  };
};

export type LustreApi = ReturnType<typeof createLustreApi>;
