import { describe, expect, it, vi } from "vitest";
import { createLustreApi, LustreApiError } from "./client";
import type { Report } from "./v1";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

const setup = (response: Response, token?: string) => {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response));
  const api = createLustreApi({
    baseUrl: "https://lustre.test/",
    fetch: fetchMock,
    token,
  });
  return { api, fetchMock };
};

const report: Report = {
  action: "mute",
  name: "Slop Bot",
  reportedAt: "2026-11-07T12:00:00.000Z",
  screenName: "slop_bot",
  source: "post",
  userId: "42",
};

describe("createLustreApi", () => {
  it("creates an install without a token", async () => {
    const body = {
      installId: "6f1c1d3e-8f0a-4c1b-9a5e-2b7d4c3e1f00",
      token: "secret",
    };
    const { api, fetchMock } = setup(jsonResponse(201, body));
    await expect(api.createInstall()).resolves.toEqual(body);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://lustre.test/v1/installs");
    expect(init?.method).toBe("POST");
    expect(init?.headers).not.toHaveProperty("authorization");
  });

  it("sends reports with the bearer token", async () => {
    const { api, fetchMock } = setup(
      jsonResponse(200, { duplicates: 0, received: 1, recorded: 1 }),
      "t0k"
    );
    await expect(api.sendReports([report])).resolves.toEqual({
      duplicates: 0,
      received: 1,
      recorded: 1,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://lustre.test/v1/reports");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer t0k",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ reports: [report] });
  });

  it("builds the blocklist query string", async () => {
    const { api, fetchMock } = setup(
      jsonResponse(200, { accounts: [], nextCursor: null }),
      "t0k"
    );
    await api.getBlocklist({ cursor: "42", minReporters: 3 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://lustre.test/v1/blocklist?cursor=42&minReporters=3"
    );
  });

  it("refuses an authenticated call without a token", async () => {
    const { api, fetchMock } = setup(jsonResponse(200, {}));
    await expect(api.getBlocklist()).rejects.toThrow("install token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws the server's error code", async () => {
    const { api } = setup(
      jsonResponse(429, {
        error: { code: "RATE_LIMITED", message: "Too many requests" },
      }),
      "t0k"
    );
    const error = await api.sendReports([report]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LustreApiError);
    expect(error).toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("throws a generic error for a body that is not JSON", async () => {
    const { api } = setup(new Response("Bad gateway", { status: 502 }));
    await expect(api.health()).rejects.toMatchObject({
      code: "HTTP_502",
      status: 502,
    });
  });

  it("rejects a response that does not match the schema", async () => {
    const { api } = setup(jsonResponse(200, { status: "down" }));
    await expect(api.health()).rejects.toThrow();
  });
});
