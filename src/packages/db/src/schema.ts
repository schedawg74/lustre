import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Epoch milliseconds. Drizzle reads and writes them as `Date`.
const timestamp = () => integer({ mode: "timestamp_ms" });
const createdAt = () =>
  timestamp()
    .notNull()
    .$defaultFn(() => new Date());

export const REPORT_ACTIONS = ["block", "mute"] as const;

// A reported X account. Only public profile data: id, handle, display name.
export const accounts = sqliteTable(
  "accounts",
  {
    createdAt: createdAt(),
    firstReportedAt: timestamp().notNull(),
    // The X user id (`rest_id`), a decimal string.
    id: text().primaryKey(),
    lastReportedAt: timestamp().notNull(),
    name: text().notNull(),
    screenName: text().notNull(),
    updatedAt: timestamp()
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("accounts_last_reported_at_idx").on(table.lastReportedAt)]
);

// An anonymous extension install. It holds nothing about the reporter's X identity.
export const installs = sqliteTable(
  "installs",
  {
    createdAt: createdAt(),
    id: text().primaryKey(),
    lastSeenAt: timestamp().notNull(),
    // SHA-256 (hex) of the API token. The token itself is never stored.
    tokenHash: text().notNull(),
  },
  (table) => [uniqueIndex("installs_token_hash_idx").on(table.tokenHash)]
);

// One block or mute of an account by one install. A retry of the same report changes nothing.
export const reports = sqliteTable(
  "reports",
  {
    accountId: text()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    action: text({ enum: REPORT_ACTIONS }).notNull(),
    createdAt: createdAt(),
    id: integer().primaryKey(),
    installId: text()
      .notNull()
      .references(() => installs.id, { onDelete: "cascade" }),
    reportedAt: timestamp().notNull(),
    // Where the install blocked the account: `list:<list id>` or `post`.
    source: text().notNull(),
  },
  (table) => [
    uniqueIndex("reports_install_account_action_idx").on(
      table.installId,
      table.accountId,
      table.action
    ),
    index("reports_account_id_idx").on(table.accountId),
    check("reports_action_check", sql`${table.action} in ('block', 'mute')`),
  ]
);
