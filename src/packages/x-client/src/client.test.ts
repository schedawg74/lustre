import { describe, expect, it, vi } from "vitest";
import {
  createXClient,
  WEB_APP_BEARER,
  XAuthError,
  XRateLimitError,
  XRequestError,
  XTargetUnavailableError,
} from "./client";

const jsonResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...headers },
    status,
  });

const setup = (response: Response | Error, csrf: string | null = "t0k") => {
  const fetchMock = vi.fn<typeof fetch>(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response)
  );
  const client = createXClient({
    fetch: fetchMock,
    getCsrfToken: () => csrf ?? undefined,
    now: () => 1_000_000,
    origin: "https://x.com",
  });
  return { client, fetchMock };
};

describe("createXClient", () => {
  it("posts a block by user id with the session headers", async () => {
    const { client, fetchMock } = setup(jsonResponse(200, { id_str: "42" }));
    await client.block({ userId: "42" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://x.com/i/api/1.1/blocks/create.json");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(init?.body).toBe("user_id=42");
    expect(init?.headers).toMatchObject({
      authorization: WEB_APP_BEARER,
      "x-csrf-token": "t0k",
      "x-twitter-auth-type": "OAuth2Session",
    });
  });

  it("mutes by handle", async () => {
    const { client, fetchMock } = setup(jsonResponse(200, {}));
    await client.mute({ screenName: "slopper" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://x.com/i/api/1.1/mutes/users/create.json");
    expect(init?.body).toBe("screen_name=slopper");
  });

  it("fails before any request when there is no session", async () => {
    const { client, fetchMock } = setup(jsonResponse(200, {}), null);
    await expect(client.block({ userId: "1" })).rejects.toBeInstanceOf(
      XAuthError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the rate limit reset time", async () => {
    const { client } = setup(
      jsonResponse(429, {}, { "x-rate-limit-reset": "2000" })
    );
    const error = await client.block({ userId: "1" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(XRateLimitError);
    expect((error as XRateLimitError).resetAt).toBe(2_000_000);
  });

  it("waits 15 minutes when the reset header is missing", async () => {
    const { client } = setup(jsonResponse(429, {}));
    const error = await client.block({ userId: "1" }).catch((e: unknown) => e);
    expect((error as XRateLimitError).resetAt).toBe(1_000_000 + 15 * 60_000);
  });

  it("treats suspended or missing accounts as unavailable", async () => {
    const { client } = setup(
      jsonResponse(403, { errors: [{ code: 63, message: "suspended" }] })
    );
    await expect(client.block({ userId: "1" })).rejects.toBeInstanceOf(
      XTargetUnavailableError
    );
  });

  it("treats a refused session as an auth error", async () => {
    const { client } = setup(jsonResponse(403, { errors: [{ code: 353 }] }));
    await expect(client.block({ userId: "1" })).rejects.toBeInstanceOf(
      XAuthError
    );
  });

  it("marks server and network errors as retryable", async () => {
    const server = await setup(jsonResponse(503, {}))
      .client.block({ userId: "1" })
      .catch((e: unknown) => e);
    expect(server).toBeInstanceOf(XRequestError);
    expect((server as XRequestError).retryable).toBe(true);

    const network = await setup(new TypeError("offline"))
      .client.block({ userId: "1" })
      .catch((e: unknown) => e);
    expect((network as XRequestError).retryable).toBe(true);

    const client = await setup(jsonResponse(400, {}))
      .client.block({ userId: "1" })
      .catch((e: unknown) => e);
    expect((client as XRequestError).retryable).toBe(false);
  });
});
