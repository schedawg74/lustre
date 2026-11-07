import { z } from "zod";

// Version 1 of the Lustre blocklist API. Every request and response body has a
// schema here; the server validates requests with them, the client validates
// responses.

export const API_PATHS = {
  blocklist: "/v1/blocklist",
  health: "/health",
  installs: "/v1/installs",
  lists: "/v1/lists",
  reports: "/v1/reports",
  stats: "/v1/stats",
} as const;

export const MAX_REPORTS_PER_BATCH = 500;
export const MAX_BLOCKLIST_PAGE = 1000;
// The blocklist shows at most this many list ids per account.
export const MAX_LIST_IDS_PER_ACCOUNT = 10;
// The default `minReporters` of the blocklist. The stats count with it too.
export const DEFAULT_MIN_REPORTERS = 1;
export const STATS_RECENT_COUNT = 10;

// The X user id (`rest_id`): a decimal string. It does not fit in a JS number.
export const userIdSchema = z.string().regex(/^\d{1,20}$/);
// The X list id: a decimal string, like a user id.
export const listIdSchema = z.string().regex(/^\d{1,20}$/);
export const screenNameSchema = z.string().regex(/^\w{1,50}$/);
export const reportActionSchema = z.enum(["block", "mute"]);
// `list` for an imported X list, `post` for a button on a post.
export const reportSourceSchema = z.enum(["list", "post"]);
const timestampSchema = z.iso.datetime({ offset: true });

export const healthResponseSchema = z.object({ status: z.literal("ok") });

export const createInstallResponseSchema = z.object({
  installId: z.uuid(),
  // Shown once. The server stores only its SHA-256 hash.
  token: z.string().min(1),
});

// The imported X list. Public data, like the account.
export const reportListSchema = z.object({
  id: listIdSchema,
  name: z.string().min(1).max(100).optional(),
  ownerScreenName: screenNameSchema.optional(),
});

// Only public data of the blocked or muted account. Never the reporter's X identity.
export const reportSchema = z
  .object({
    action: reportActionSchema,
    // Present only for the source `list`.
    list: reportListSchema.optional(),
    name: z.string().max(100),
    reportedAt: timestampSchema,
    screenName: screenNameSchema,
    source: reportSourceSchema,
    userId: userIdSchema,
  })
  .refine((report) => (report.source === "list") === Boolean(report.list), {
    message: "A report has a list if and only if its source is list",
    path: ["list"],
  });

export const reportBatchSchema = z.object({
  reports: z.array(reportSchema).min(1).max(MAX_REPORTS_PER_BATCH),
});

export const reportBatchResponseSchema = z.object({
  // Reports already stored for this install, account, and action.
  duplicates: z.number().int().min(0),
  received: z.number().int().min(0),
  recorded: z.number().int().min(0),
});

export const blocklistQuerySchema = z.object({
  // The `nextCursor` of the previous page.
  cursor: userIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_BLOCKLIST_PAGE).default(500),
  // Accounts that at least one install reported from this X list.
  listId: listIdSchema.optional(),
  // Accounts that at least this many installs reported.
  minReporters: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .default(DEFAULT_MIN_REPORTERS),
  // Accounts with a report at or after this time.
  since: timestampSchema.optional(),
});

export const blocklistAccountSchema = z.object({
  firstReportedAt: timestampSchema,
  lastReportedAt: timestampSchema,
  // The X lists the account was reported from, most reporting installs first.
  listIds: z.array(listIdSchema).max(MAX_LIST_IDS_PER_ACCOUNT),
  name: z.string(),
  // Distinct installs that blocked or muted the account.
  reporters: z.number().int().min(1),
  screenName: screenNameSchema,
  userId: userIdSchema,
});

export const blocklistResponseSchema = z.object({
  accounts: z.array(blocklistAccountSchema),
  nextCursor: userIdSchema.nullable(),
});

export const listsQuerySchema = z.object({
  // The `nextCursor` of the previous page.
  cursor: listIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_BLOCKLIST_PAGE).default(500),
});

export const knownListSchema = z.object({
  // Accounts whose latest report from an install names this list.
  accounts: z.number().int().min(1),
  firstReportedAt: timestampSchema,
  id: listIdSchema,
  lastReportedAt: timestampSchema,
  name: z.string().nullable(),
  ownerScreenName: screenNameSchema.nullable(),
  // Distinct installs that reported accounts from this list.
  reporters: z.number().int().min(1),
});

export const listsResponseSchema = z.object({
  lists: z.array(knownListSchema),
  nextCursor: listIdSchema.nullable(),
});

// Public numbers for the landing page. No user ids, names, lists, or installs.
export const statsResponseSchema = z.object({
  // Accounts with block reports from at least `DEFAULT_MIN_REPORTERS` installs.
  accountsBlocked: z.number().int().min(0),
  // The latest blocked accounts, newest first.
  recent: z
    .array(
      z.object({
        blockedAt: timestampSchema,
        // For example `slo•••bot`. The full handle never leaves the server.
        maskedHandle: z.string(),
      })
    )
    .max(STATS_RECENT_COUNT),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    issues: z
      .array(z.object({ message: z.string(), path: z.string() }))
      .optional(),
    message: z.string(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type CreateInstallResponse = z.infer<typeof createInstallResponseSchema>;
export type ReportAction = z.infer<typeof reportActionSchema>;
export type ReportSource = z.infer<typeof reportSourceSchema>;
export type ReportList = z.infer<typeof reportListSchema>;
export type Report = z.infer<typeof reportSchema>;
export type ReportBatch = z.infer<typeof reportBatchSchema>;
export type ReportBatchResponse = z.infer<typeof reportBatchResponseSchema>;
export type BlocklistQuery = z.input<typeof blocklistQuerySchema>;
export type ParsedBlocklistQuery = z.output<typeof blocklistQuerySchema>;
export type BlocklistAccount = z.infer<typeof blocklistAccountSchema>;
export type BlocklistResponse = z.infer<typeof blocklistResponseSchema>;
export type ListsQuery = z.input<typeof listsQuerySchema>;
export type ParsedListsQuery = z.output<typeof listsQuerySchema>;
export type KnownList = z.infer<typeof knownListSchema>;
export type ListsResponse = z.infer<typeof listsResponseSchema>;
export type StatsResponse = z.infer<typeof statsResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
