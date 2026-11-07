import { afterEach, describe, expect, it, vi } from "vitest";
import { displayHandle, SAMPLE_STATS } from "./stats";

const loadWithApi = async (
  answer: () => Promise<Response>
): Promise<typeof import("./stats")> => {
  vi.stubEnv("PUBLIC_API_URL", "https://api.lustre.test");
  vi.stubGlobal("fetch", vi.fn(answer));
  vi.resetModules();
  return await import("./stats");
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("displayHandle", () => {
  it("adds @ to a masked handle", () => {
    expect(displayHandle("slo•••bot")).toBe("@slo•••bot");
    expect(displayHandle("@slo•••bot")).toBe("@slo•••bot");
  });

  it("masks an unmasked handle like the server", () => {
    expect(displayHandle("slopmaster")).toBe("@slo•••ter");
    expect(displayHandle("abcdef")).toBe("@a•••");
  });
});

describe("fetchStats", () => {
  it("returns the sample data when the API URL is unset", async () => {
    const { fetchStats } = await import("./stats");
    await expect(fetchStats()).resolves.toEqual({
      source: "sample",
      stats: SAMPLE_STATS,
    });
  });

  it("returns live stats from /v1/stats", async () => {
    const body = {
      accountsBlocked: 12,
      recent: [
        { blockedAt: "2026-11-07T12:00:00.000Z", maskedHandle: "spa•••000" },
      ],
    };
    const { fetchStats } = await loadWithApi(async () => Response.json(body));
    await expect(fetchStats()).resolves.toEqual({
      source: "live",
      stats: body,
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "https://api.lustre.test/v1/stats"
    );
  });

  it("falls back to the sample data on a wrong shape or a failed request", async () => {
    const wrongShape = await loadWithApi(async () =>
      Response.json({ accountsBlocked: "many" })
    );
    expect((await wrongShape.fetchStats()).source).toBe("sample");
    const failed = await loadWithApi(() =>
      Promise.reject(new Error("offline"))
    );
    expect((await failed.fetchStats()).source).toBe("sample");
  });
});
