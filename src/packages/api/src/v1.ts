import { z } from "zod";

// Version 1 of the Lustre blocklist API. Every request and response body has a
// schema here; the server validates requests with them, the client validates
// responses.

export const API_PATHS = {
  blocklist: "/v1/blocklist",
  health: "/health",
  installs: "/v1/installs",
  reports: "/v1/reports",
} as const;

export const MAX_REPORTS_PER_BATCH = 500;
export const MAX_BLOCKLIST_PAGE = 1000;

// The X user id (`rest_id`): a decimal string. It does not fit in a JS number.
export const userIdSchema = z.string().regex(/^\d{1,20}$/);
export const screenNameSchema = z.string().regex(/^\w{1,50}$/);
export const reportActionSchema = z.enum(["block", "mute"]);
// `list:<list id>` for an imported X list, `post` for a button on a post.
export const reportSourceSchema = z.string().regex(/^(post|list:\d{1,20})$/);
const timestampSchema = z.iso.datetime({ offset: true });

export const healthResponseSchema = z.object({ status: z.literal("ok") });

export const createInstallResponseSchema = z.object({
  installId: z.uuid(),
  // Shown once. The server stores only its SHA-256 hash.
  token: z.string().min(1),
});

// Only public data of the blocked or muted account. Never the reporter's X identity.
export const reportSchema = z.object({
  action: reportActionSchema,
  name: z.string().max(100),
  reportedAt: timestampSchema,
  screenName: screenNameSchema,
  source: reportSourceSchema,
  userId: userIdSchema,
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
  // Accounts that at least this many installs reported.
  minReporters: z.coerce.number().int().min(1).max(1_000_000).default(1),
  // Accounts with a report at or after this time.
  since: timestampSchema.optional(),
});

export const blocklistAccountSchema = z.object({
  firstReportedAt: timestampSchema,
  lastReportedAt: timestampSchema,
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
export type Report = z.infer<typeof reportSchema>;
export type ReportBatch = z.infer<typeof reportBatchSchema>;
export type ReportBatchResponse = z.infer<typeof reportBatchResponseSchema>;
export type BlocklistQuery = z.input<typeof blocklistQuerySchema>;
export type ParsedBlocklistQuery = z.output<typeof blocklistQuerySchema>;
export type BlocklistAccount = z.infer<typeof blocklistAccountSchema>;
export type BlocklistResponse = z.infer<typeof blocklistResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
