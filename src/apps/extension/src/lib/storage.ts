import type { BlockQueue } from "@feedwarden/block-queue/queue";
import { storage } from "wxt/utils/storage";

/** The list that started this project: accounts that post AI slop. */
export const DEFAULT_LIST_URL = "https://x.com/i/lists/2116659176894071283";

export type Settings = {
  /** Buttons added under every post on X. */
  showBlockButton: boolean;
  showMuteButton: boolean;
  showNotInterestedButton: boolean;
  /** Hide the post at once after one of the buttons was used. */
  hideAfterAction: boolean;
  /** Never bulk-block accounts you follow. */
  skipFollowing: boolean;
  /** Handles that are never bulk-blocked. */
  allowlist: string[];
  /** Average pause between two bulk blocks. */
  blockDelayMs: number;
  /** Start blocking as soon as a list import finishes. */
  autoStartAfterImport: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  allowlist: [],
  autoStartAfterImport: false,
  blockDelayMs: 2500,
  hideAfterAction: true,
  showBlockButton: true,
  showMuteButton: true,
  showNotInterestedButton: true,
  skipFollowing: true,
};

export type RunnerState = {
  status: "idle" | "running" | "paused";
  /**
   * Epoch ms. The runner waits until then after a 429. Cleared with null:
   * messages drop keys whose value is undefined.
   */
  rateLimitedUntil?: number | null;
  lastError?: string | null;
};

export type TrackedList = {
  listId: string;
  url: string;
  lastImportedAt?: number;
  memberCount?: number;
};

export type PendingImport = { listId: string; requestedAt: number };

export const settingsItem = storage.defineItem<Settings>("local:settings", {
  fallback: DEFAULT_SETTINGS,
});

export const queueItem = storage.defineItem<BlockQueue>("local:blockQueue", {
  fallback: {},
});

export const runnerItem = storage.defineItem<RunnerState>("local:runner", {
  fallback: { status: "idle" },
});

/** Epoch ms. The x.com tab that runs the queue sets it every few seconds. */
export const runnerHeartbeatItem = storage.defineItem<number>(
  "local:runnerHeartbeat",
  { fallback: 0 }
);

export const listsItem = storage.defineItem<Record<string, TrackedList>>(
  "local:lists",
  { fallback: {} }
);

export const pendingImportItem = storage.defineItem<PendingImport | null>(
  "local:pendingImport",
  { fallback: null }
);

/** Settings saved by an older version miss newer keys; fill them in. */
export const readSettings = async (): Promise<Settings> => ({
  ...DEFAULT_SETTINGS,
  ...(await settingsItem.getValue()),
});

export const watchSettings = (onChange: (settings: Settings) => void) =>
  settingsItem.watch((value) => onChange({ ...DEFAULT_SETTINGS, ...value }));
