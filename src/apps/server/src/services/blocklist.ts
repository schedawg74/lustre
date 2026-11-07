import type { BlocklistResponse, ParsedBlocklistQuery } from "@lustre/api/v1";
import { accounts, type Database, reports } from "@lustre/db";
import { and, countDistinct, eq, gt, gte } from "drizzle-orm";

export const createBlocklistService = (db: Database) => ({
  // Keyset pages ordered by user id. The cursor is the last user id of a page.
  list: ({
    cursor,
    limit,
    minReporters,
    since,
  }: ParsedBlocklistQuery): BlocklistResponse => {
    const reporters = countDistinct(reports.installId);
    const rows = db
      .select({
        firstReportedAt: accounts.firstReportedAt,
        lastReportedAt: accounts.lastReportedAt,
        name: accounts.name,
        reporters,
        screenName: accounts.screenName,
        userId: accounts.id,
      })
      .from(accounts)
      .innerJoin(reports, eq(reports.accountId, accounts.id))
      .where(
        and(
          cursor === undefined ? undefined : gt(accounts.id, cursor),
          since === undefined
            ? undefined
            : gte(accounts.lastReportedAt, new Date(since))
        )
      )
      .groupBy(accounts.id)
      .having(gte(reporters, minReporters))
      .orderBy(accounts.id)
      .limit(limit + 1)
      .all();
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      accounts: page.map((row) => ({
        ...row,
        firstReportedAt: row.firstReportedAt.toISOString(),
        lastReportedAt: row.lastReportedAt.toISOString(),
      })),
      nextCursor: rows.length > limit && last ? last.userId : null,
    };
  },
});
