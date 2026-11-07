import type { BlocklistResponse, ParsedBlocklistQuery } from "@lustre/api/v1";
import { MAX_LIST_IDS_PER_ACCOUNT } from "@lustre/api/v1";
import { accounts, type Database, reports } from "@lustre/db";
import {
  and,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
} from "drizzle-orm";

export const createBlocklistService = (db: Database) => {
  // The lists of each account, most reporting installs first, then by id.
  const listIdsOf = (accountIds: string[]) => {
    const listIds = new Map<string, string[]>();
    if (accountIds.length === 0) {
      return listIds;
    }
    const reporters = countDistinct(reports.installId);
    const rows = db
      .select({ accountId: reports.accountId, listId: reports.listId })
      .from(reports)
      .where(
        and(inArray(reports.accountId, accountIds), isNotNull(reports.listId))
      )
      .groupBy(reports.accountId, reports.listId)
      .orderBy(reports.accountId, desc(reporters), reports.listId)
      .all();
    for (const { accountId, listId } of rows) {
      const ids = listIds.get(accountId) ?? [];
      if (listId !== null && ids.length < MAX_LIST_IDS_PER_ACCOUNT) {
        ids.push(listId);
      }
      listIds.set(accountId, ids);
    }
    return listIds;
  };

  return {
    // Keyset pages ordered by user id. The cursor is the last user id of a page.
    list: ({
      cursor,
      limit,
      listId,
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
              : gte(accounts.lastReportedAt, new Date(since)),
            listId === undefined
              ? undefined
              : inArray(
                  accounts.id,
                  db
                    .select({ id: reports.accountId })
                    .from(reports)
                    .where(eq(reports.listId, listId))
                )
          )
        )
        .groupBy(accounts.id)
        .having(gte(reporters, minReporters))
        .orderBy(accounts.id)
        .limit(limit + 1)
        .all();
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const listIds = listIdsOf(page.map((row) => row.userId));
      return {
        accounts: page.map((row) => ({
          ...row,
          firstReportedAt: row.firstReportedAt.toISOString(),
          lastReportedAt: row.lastReportedAt.toISOString(),
          listIds: listIds.get(row.userId) ?? [],
        })),
        nextCursor: rows.length > limit && last ? last.userId : null,
      };
    },
  };
};
