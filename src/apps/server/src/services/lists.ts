import type { ListsResponse, ParsedListsQuery } from "@lustre/api/v1";
import { type Database, lists, reports } from "@lustre/db";
import { countDistinct, eq, gt } from "drizzle-orm";

export const createListService = (db: Database) => ({
  // Keyset pages ordered by list id. The cursor is the last list id of a page.
  list: ({ cursor, limit }: ParsedListsQuery): ListsResponse => {
    const rows = db
      .select({
        accounts: countDistinct(reports.accountId),
        firstReportedAt: lists.firstReportedAt,
        id: lists.id,
        lastReportedAt: lists.lastReportedAt,
        name: lists.name,
        ownerScreenName: lists.ownerScreenName,
        reporters: countDistinct(reports.installId),
      })
      .from(lists)
      .innerJoin(reports, eq(reports.listId, lists.id))
      .where(cursor === undefined ? undefined : gt(lists.id, cursor))
      .groupBy(lists.id)
      .orderBy(lists.id)
      .limit(limit + 1)
      .all();
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      lists: page.map((row) => ({
        ...row,
        firstReportedAt: row.firstReportedAt.toISOString(),
        lastReportedAt: row.lastReportedAt.toISOString(),
      })),
      nextCursor: rows.length > limit && last ? last.id : null,
    };
  },
});
