import type { XUser } from "@lustre/x-client/users";

export type EntryStatus = "pending" | "blocked" | "skipped" | "failed";

export type SkipReason = "allowlisted" | "already-blocked" | "you-follow";

export type QueueEntry = {
  userId: string;
  screenName: string;
  name: string;
  /**
   * Every place the account came from, such as `list:2116659176894071283`
   * or `post`. An account on two lists has both.
   */
  sources: string[];
  status: EntryStatus;
  /** Why it was skipped or why the last attempt failed. */
  reason?: string;
  attempts: number;
  addedAt: number;
  updatedAt: number;
};

/** Accounts to block, keyed by user id. */
export type BlockQueue = Record<string, QueueEntry>;

export type AddOptions = {
  /** Where these accounts come from, such as `list:2116659176894071283`. */
  source: string;
  /** Handles that are never blocked. Compared case-insensitively, `@` ignored. */
  allowlist: readonly string[];
  skipFollowing: boolean;
  now: number;
};

export type AddResult = {
  queue: BlockQueue;
  added: number;
  skipped: Record<SkipReason, number>;
  duplicates: number;
};

export const normalizeHandle = (handle: string): string =>
  handle.trim().replace(/^@/, "").toLowerCase();

const skipReasonFor = (
  user: XUser,
  allowlist: ReadonlySet<string>,
  skipFollowing: boolean
): SkipReason | undefined => {
  if (allowlist.has(normalizeHandle(user.screenName))) {
    return "allowlisted";
  }
  if (user.blocking) {
    return "already-blocked";
  }
  if (skipFollowing && user.following) {
    return "you-follow";
  }
};

/**
 * Adds accounts to the queue. An account already in the queue keeps its
 * entry and status, so importing a list again only adds its new members; it
 * only gains the new source, so it counts for every list it is on.
 */
export const addCandidates = (
  queue: BlockQueue,
  users: readonly XUser[],
  options: AddOptions
): AddResult => {
  const allowlist = new Set(options.allowlist.map(normalizeHandle));
  const next: BlockQueue = { ...queue };
  const skipped: Record<SkipReason, number> = {
    allowlisted: 0,
    "already-blocked": 0,
    "you-follow": 0,
  };
  let added = 0;
  let duplicates = 0;
  for (const user of users) {
    const existing = next[user.id];
    if (existing) {
      duplicates += 1;
      if (!existing.sources.includes(options.source)) {
        next[user.id] = {
          ...existing,
          sources: [...existing.sources, options.source],
        };
      }
      continue;
    }
    const reason = skipReasonFor(user, allowlist, options.skipFollowing);
    next[user.id] = {
      name: user.name,
      screenName: user.screenName,
      sources: [options.source],
      status: reason ? "skipped" : "pending",
      userId: user.id,
      ...(reason ? { reason } : {}),
      addedAt: options.now,
      attempts: 0,
      updatedAt: options.now,
    };
    if (reason) {
      skipped[reason] += 1;
    } else {
      added += 1;
    }
  }
  return { added, duplicates, queue: next, skipped };
};

/** The oldest pending entry, so accounts are blocked in import order. */
export const nextPending = (queue: BlockQueue): QueueEntry | undefined => {
  let oldest: QueueEntry | undefined;
  for (const entry of Object.values(queue)) {
    if (
      entry.status === "pending" &&
      (!oldest || entry.addedAt < oldest.addedAt)
    ) {
      oldest = entry;
    }
  }
  return oldest;
};

export const MAX_ATTEMPTS = 3;

export type Outcome =
  | { kind: "blocked" }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string; retryable: boolean };

/**
 * Records the result of one block attempt. A retryable failure stays pending
 * until it has failed {@link MAX_ATTEMPTS} times.
 */
export const recordOutcome = (
  queue: BlockQueue,
  userId: string,
  outcome: Outcome,
  now: number,
  /**
   * The entry as the runner saw it. If the entry left the queue while its
   * block request was in flight (its list was removed), a completed block
   * is still recorded from this copy, without the removed sources.
   */
  attempted?: QueueEntry
): BlockQueue => {
  const entry =
    queue[userId] ??
    (outcome.kind === "blocked" && attempted
      ? { ...attempted, sources: [] }
      : undefined);
  if (!entry) {
    return queue;
  }
  const attempts = entry.attempts + 1;
  let updated: QueueEntry;
  if (outcome.kind === "blocked") {
    const { reason: _previousReason, ...rest } = entry;
    updated = { ...rest, attempts, status: "blocked", updatedAt: now };
  } else if (outcome.kind === "skipped") {
    updated = {
      ...entry,
      attempts,
      reason: outcome.reason,
      status: "skipped",
      updatedAt: now,
    };
  } else {
    const giveUp = !outcome.retryable || attempts >= MAX_ATTEMPTS;
    updated = {
      ...entry,
      attempts,
      reason: outcome.reason,
      status: giveUp ? "failed" : "pending",
      updatedAt: now,
    };
  }
  return { ...queue, [userId]: updated };
};

/** Skips one entry by hand, for example from the popup's review list. */
export const skipEntry = (
  queue: BlockQueue,
  userId: string,
  now: number
): BlockQueue => {
  const entry = queue[userId];
  if (entry?.status !== "pending") {
    return queue;
  }
  return {
    ...queue,
    [userId]: {
      ...entry,
      reason: "skipped-by-you",
      status: "skipped",
      updatedAt: now,
    },
  };
};

export const retryFailed = (queue: BlockQueue, now: number): BlockQueue => {
  const next: BlockQueue = {};
  for (const [id, entry] of Object.entries(queue)) {
    next[id] =
      entry.status === "failed"
        ? { ...entry, attempts: 0, status: "pending", updatedAt: now }
        : entry;
  }
  return next;
};

export type QueueSummary = Record<EntryStatus, number> & { total: number };

export const summarize = (queue: BlockQueue): QueueSummary => {
  const summary: QueueSummary = {
    blocked: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    total: 0,
  };
  for (const entry of Object.values(queue)) {
    summary[entry.status] += 1;
    summary.total += 1;
  }
  return summary;
};

/**
 * Waits `baseMs` give or take half of it, so requests do not arrive on a
 * fixed beat. `random` is injectable for tests.
 */
export const jitteredDelay = (
  baseMs: number,
  random: () => number = Math.random
): number => Math.round(baseMs * (0.5 + random()));

export type RemoveSourceResult = {
  queue: BlockQueue;
  /** Unblocked accounts that came only from this source and left the queue. */
  dropped: number;
};

/**
 * Forgets one source, for example when a list is removed. Accounts that
 * came only from it leave the queue if they are not blocked yet (pending or
 * failed); blocked and skipped accounts stay as history.
 */
export const removeSource = (
  queue: BlockQueue,
  source: string
): RemoveSourceResult => {
  const next: BlockQueue = {};
  let dropped = 0;
  for (const [id, entry] of Object.entries(queue)) {
    if (!entry.sources.includes(source)) {
      next[id] = entry;
      continue;
    }
    const sources = entry.sources.filter((item) => item !== source);
    // Failed accounts too: Retry all would otherwise block them later.
    if (
      sources.length === 0 &&
      (entry.status === "pending" || entry.status === "failed")
    ) {
      dropped += 1;
      continue;
    }
    next[id] = { ...entry, sources };
  }
  return { dropped, queue: next };
};

/** Queue entries as stored before an account could have several sources. */
type LegacyEntry = Omit<QueueEntry, "sources"> & { source: string };

/** Upgrades entries saved with a single `source` (storage version 1). */
export const migrateQueueV1 = (
  queue: Record<string, QueueEntry | LegacyEntry>
): BlockQueue => {
  const next: BlockQueue = {};
  for (const [id, entry] of Object.entries(queue)) {
    if ("sources" in entry) {
      next[id] = entry;
      continue;
    }
    const { source, ...rest } = entry;
    next[id] = { ...rest, sources: [source] };
  }
  return next;
};
