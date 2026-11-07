import { afterEach, describe, expect, it, vi } from "vitest";
import { maskHandle, SAMPLE_STATS } from "./stats";

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

describe("maskHandle", () => {
  it("keeps the first and last three characters", () => {
    expect(maskHandle("@slopmaster")).toBe("@slo•••ter");
  });

  it("shows less of a short handle", () => {
    expect(maskHandle("@slopguru")).toBe("@sl•••ru");
    expect(maskHandle("@abcdefg")).toBe("@ab•••fg");
    expect(maskHandle("@ab")).toBe("@•••");
  });

  it("passes a masked handle through", () => {
    expect(maskHandle("@abc•••xyz")).toBe("@abc•••xyz");
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

  it("returns live stats and masks unmasked handles", async () => {
    const { fetchStats } = await loadWithApi(async () =>
      Response.json({
        accountsBlocked: 12,
        recent: [
          { blockedAt: "2026-11-07T12:00:00Z", maskedHandle: "@spambot9000" },
        ],
      })
    );
    await expect(fetchStats()).resolves.toEqual({
      source: "live",
      stats: {
        accountsBlocked: 12,
        recent: [
          { blockedAt: "2026-11-07T12:00:00Z", maskedHandle: "@spa•••000" },
        ],
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.lustre.test/v1/stats",
      expect.anything()
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
