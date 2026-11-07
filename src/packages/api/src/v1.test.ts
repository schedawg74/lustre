import { describe, expect, it } from "vitest";
import {
  blocklistQuerySchema,
  MAX_REPORTS_PER_BATCH,
  type Report,
  reportBatchSchema,
} from "./v1";

const report: Report = {
  action: "block",
  list: {
    id: "2116659176894071283",
    name: "Slop accounts",
    ownerScreenName: "list_owner",
  },
  name: "Slop Bot",
  reportedAt: "2026-11-07T12:00:00.000Z",
  screenName: "slop_bot",
  source: "list",
  userId: "1234567890123456789",
};
const { list: _list, ...postReport } = report;

describe("reportBatchSchema", () => {
  it("accepts a valid batch", () => {
    expect(reportBatchSchema.parse({ reports: [report] })).toEqual({
      reports: [report],
    });
  });

  it("accepts a post source and a time offset", () => {
    const parsed = reportBatchSchema.safeParse({
      reports: [
        {
          ...postReport,
          reportedAt: "2026-11-07T13:00:00+01:00",
          source: "post",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a list with the id only", () => {
    const parsed = reportBatchSchema.safeParse({
      reports: [{ ...report, list: { id: "42" } }],
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
    ["the version 0 source", [{ ...report, source: "list:42" }]],
    ["a list source without a list", [{ ...postReport, source: "list" }]],
    ["a post source with a list", [{ ...report, source: "post" }]],
    ["a list id with letters", [{ ...report, list: { id: "slop" } }]],
    [
      "a list name above the limit",
      [{ ...report, list: { id: "42", name: "x".repeat(101) } }],
    ],
    ["an empty list name", [{ ...report, list: { id: "42", name: "" } }]],
    [
      "a list owner with @",
      [{ ...report, list: { id: "42", ownerScreenName: "@owner" } }],
    ],
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

  it("rejects a list id with letters", () => {
    expect(blocklistQuerySchema.safeParse({ listId: "abc" }).success).toBe(
      false
    );
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
