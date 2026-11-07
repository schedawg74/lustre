import {
  DEFAULT_MIN_REPORTERS,
  STATS_RECENT_COUNT,
  type StatsResponse,
} from "@lustre/api/v1";
import { accounts, type Database, reports } from "@lustre/db";
import { count, countDistinct, desc, eq, gte, max } from "drizzle-orm";

const CACHE_MS = 60_000;
const MASK = "•••";

// `slop_bot` -> `slo•••bot`, `slop` -> `s•••`. The full handle stays on the server.
export const maskHandle = (handle: string) =>
  handle.length < 7
    ? `${handle.slice(0, 1)}${MASK}`
    : `${handle.slice(0, 3)}${MASK}${handle.slice(-3)}`;

export const createStatsService = (db: Database, now: () => Date) => {
  let cached: { expiresAt: number; value: StatsResponse } | undefined;

  const load = (): StatsResponse => {
    const reporters = countDistinct(reports.installId);
    const blockedAt = max(reports.reportedAt).as("blocked_at");
    // Accounts that enough installs blocked, as in the default blocklist.
    const blocked = db
      .select({ blockedAt, screenName: accounts.screenName })
      .from(accounts)
      .innerJoin(reports, eq(reports.accountId, accounts.id))
      .where(eq(reports.action, "block"))
      .groupBy(accounts.id)
      .having(gte(reporters, DEFAULT_MIN_REPORTERS))
      .as("blocked");
    const total = db.select({ value: count() }).from(blocked).get();
    const recent = db
      .select()
      .from(blocked)
      .orderBy(desc(blocked.blockedAt))
      .limit(STATS_RECENT_COUNT)
      .all();
    return {
      accountsBlocked: total?.value ?? 0,
      recent: recent.flatMap((row) =>
        row.blockedAt
          ? [
              {
                blockedAt: row.blockedAt.toISOString(),
                maskedHandle: maskHandle(row.screenName),
              },
            ]
          : []
      ),
    };
  };

  return {
    // Cached for a minute: the route is public.
    get: (): StatsResponse => {
      const time = now().getTime();
      if (!cached || cached.expiresAt <= time) {
        cached = { expiresAt: time + CACHE_MS, value: load() };
      }
      return cached.value;
    },
  };
};
