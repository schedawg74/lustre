import { describe, expect, it } from "vitest";
import {
  blocklistQuerySchema,
  MAX_REPORTS_PER_BATCH,
  type Report,
  reportBatchSchema,
} from "./v1";

const report: Report = {
  action: "block",
  name: "Slop Bot",
  reportedAt: "2026-11-07T12:00:00.000Z",
  screenName: "slop_bot",
  source: "list:2116659176894071283",
  userId: "1234567890123456789",
};

describe("reportBatchSchema", () => {
  it("accepts a valid batch", () => {
    expect(reportBatchSchema.parse({ reports: [report] })).toEqual({
      reports: [report],
    });
  });

  it("accepts a post source and a time offset", () => {
    const parsed = reportBatchSchema.safeParse({
      reports: [
        { ...report, reportedAt: "2026-11-07T13:00:00+01:00", source: "post" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("drops unknown fields, so no extra data is stored", () => {
    const parsed = reportBatchSchema.parse({
      reports: [{ ...report, reporterHandle: "me" }],
    });
    expect(parsed.reports[0]).not.toHaveProperty("reporterHandle");
  });

  it.each([
    ["an empty batch", []],
    [
      "a batch above the limit",
      Array.from({ length: MAX_REPORTS_PER_BATCH + 1 }, () => report),
    ],
    ["a numeric user id", [{ ...report, userId: 42 }]],
    ["a handle with @", [{ ...report, screenName: "@slop" }]],
    ["an unknown action", [{ ...report, action: "report" }]],
    ["a free-text source", [{ ...report, source: "my friend told me" }]],
    ["a time without zone", [{ ...report, reportedAt: "2026-11-07 12:00" }]],
  ])("rejects %s", (_label, reports) => {
    expect(reportBatchSchema.safeParse({ reports }).success).toBe(false);
  });
});

describe("blocklistQuerySchema", () => {
  it("applies defaults", () => {
    expect(blocklistQuerySchema.parse({})).toEqual({
      limit: 500,
      minReporters: 1,
    });
  });

  it("coerces query strings", () => {
    expect(
      blocklistQuerySchema.parse({ limit: "10", minReporters: "3" })
    ).toMatchObject({ limit: 10, minReporters: 3 });
  });

  it("rejects a page above the limit and a bad cursor", () => {
    expect(blocklistQuerySchema.safeParse({ limit: "1001" }).success).toBe(
      false
    );
    expect(blocklistQuerySchema.safeParse({ cursor: "abc" }).success).toBe(
      false
    );
  });
});
