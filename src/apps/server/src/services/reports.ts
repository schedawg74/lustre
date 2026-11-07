import type { Report, ReportBatchResponse } from "@lustre/api/v1";
import { accounts, type Database, reports } from "@lustre/db";
import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

// The newer report decides the handle and display name of an account.
const fromNewer = (column: AnySQLiteColumn, columnName: string) =>
  sql`case when excluded.last_reported_at >= ${accounts.lastReportedAt} then excluded.${sql.identifier(columnName)} else ${column} end`;

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
            name: fromNewer(accounts.name, "name"),
            screenName: fromNewer(accounts.screenName, "screen_name"),
            updatedAt: receivedAt,
          },
          target: accounts.id,
        })
        .run();
      const inserted = tx
        .insert(reports)
        .values(
          rows.map((row) => ({
            accountId: row.userId,
            action: row.action,
            createdAt: receivedAt,
            installId,
            reportedAt: row.reportedAt,
            source: row.source,
          }))
        )
        .onConflictDoNothing()
        .returning({ id: reports.id })
        .all();
      return {
        duplicates: batch.length - inserted.length,
        received: batch.length,
        recorded: inserted.length,
      };
    });
  },
});
