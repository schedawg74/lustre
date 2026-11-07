import type { Report, ReportBatchResponse } from "@lustre/api/v1";
import { accounts, type Database, lists, reports } from "@lustre/db";
import { sql } from "drizzle-orm";
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

// The newer report decides the value. With `keepIfNull`, a newer report
// without a value keeps the stored one, and any value fills a stored null.
const fromNewer = (
  table: SQLiteTable,
  column: AnySQLiteColumn,
  columnName: string,
  { keepIfNull = false } = {}
) => {
  const incoming = sql`excluded.${sql.identifier(columnName)}`;
  const newer = sql`excluded.last_reported_at >= ${table}.last_reported_at`;
  if (!keepIfNull) {
    return sql`case when ${newer} then ${incoming} else ${column} end`;
  }
  return sql`case when ${incoming} is not null and (${newer} or ${column} is null) then ${incoming} else ${column} end`;
};

export const createReportService = (db: Database, now: () => Date) => ({
  record: (installId: string, batch: Report[]): ReportBatchResponse => {
    const receivedAt = now();
    const rows = batch.map((report) => {
      // A clock ahead of the server cannot date a report into the future.
      const reportedAt = new Date(
        Math.min(Date.parse(report.reportedAt), receivedAt.getTime())
      );
      return { ...report, reportedAt };
    });
    const reportRows = rows.map((row) => ({
      accountId: row.userId,
      action: row.action,
      createdAt: receivedAt,
      installId,
      listId: row.list?.id ?? null,
      reportedAt: row.reportedAt,
      source: row.source,
    }));
    return db.transaction((tx) => {
      tx.insert(accounts)
        .values(
          rows.map((row) => ({
            createdAt: receivedAt,
            firstReportedAt: row.reportedAt,
            id: row.userId,
            lastReportedAt: row.reportedAt,
            name: row.name,
            screenName: row.screenName,
            updatedAt: receivedAt,
          }))
        )
        .onConflictDoUpdate({
          set: {
            firstReportedAt: sql`min(${accounts.firstReportedAt}, excluded.first_reported_at)`,
            lastReportedAt: sql`max(${accounts.lastReportedAt}, excluded.last_reported_at)`,
            name: fromNewer(accounts, accounts.name, "name"),
            screenName: fromNewer(accounts, accounts.screenName, "screen_name"),
            updatedAt: receivedAt,
          },
          target: accounts.id,
        })
        .run();
      const listRows = rows.flatMap((row) =>
        row.list
          ? [
              {
                createdAt: receivedAt,
                firstReportedAt: row.reportedAt,
                id: row.list.id,
                lastReportedAt: row.reportedAt,
                name: row.list.name ?? null,
                ownerScreenName: row.list.ownerScreenName ?? null,
                updatedAt: receivedAt,
              },
            ]
          : []
      );
      if (listRows.length > 0) {
        tx.insert(lists)
          .values(listRows)
          .onConflictDoUpdate({
            set: {
              firstReportedAt: sql`min(${lists.firstReportedAt}, excluded.first_reported_at)`,
              lastReportedAt: sql`max(${lists.lastReportedAt}, excluded.last_reported_at)`,
              name: fromNewer(lists, lists.name, "name", { keepIfNull: true }),
              ownerScreenName: fromNewer(
                lists,
                lists.ownerScreenName,
                "owner_screen_name",
                { keepIfNull: true }
              ),
              updatedAt: receivedAt,
            },
            target: lists.id,
          })
          .run();
      }
      const inserted = tx
        .insert(reports)
        .values(reportRows)
        .onConflictDoNothing()
        .returning({ id: reports.id })
        .all();
      if (inserted.length < reportRows.length) {
        // A newer report of the same install, account, and action replaces
        // the source and the list. It is still a duplicate.
        tx.insert(reports)
          .values(reportRows)
          .onConflictDoUpdate({
            set: {
              listId: sql`excluded.list_id`,
              reportedAt: sql`excluded.reported_at`,
              source: sql`excluded.source`,
            },
            setWhere: sql`excluded.reported_at > ${reports.reportedAt}`,
            target: [reports.installId, reports.accountId, reports.action],
          })
          .run();
      }
      return {
        duplicates: batch.length - inserted.length,
        received: batch.length,
        recorded: inserted.length,
      };
    });
  },
});
