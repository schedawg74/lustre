import {
  jitteredDelay,
  nextPending,
  type Outcome,
} from "@feedwarden/block-queue/queue";
import {
  XAuthError,
  XRateLimitError,
  XRequestError,
  XTargetUnavailableError,
} from "@feedwarden/x-client/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { send } from "@/lib/messages";
import {
  queueItem,
  readSettings,
  runnerHeartbeatItem,
  runnerItem,
} from "@/lib/storage";
import type { XSession } from "./session";

const LOCK_NAME = "feedwarden-block-runner";
const HEARTBEAT_MS = 5000;
/** The longest single wait, so a reloaded extension frees the lock soon. */
const MAX_WAIT_MS = 30_000;
const RATE_LIMIT_MARGIN_MS = 5000;

/** Waits `ms`, or less when the runner state changes (pause, resume). */
const waitOrRunnerChange = (ms: number) =>
  new Promise<void>((resolve) => {
    let unwatch: () => void = () => undefined;
    const timer = setTimeout(
      () => {
        unwatch();
        resolve();
      },
      Math.min(ms, MAX_WAIT_MS)
    );
    unwatch = runnerItem.watch(() => {
      clearTimeout(timer);
      unwatch();
      resolve();
    });
  });

type Attempt =
  | { kind: "outcome"; outcome: Outcome }
  | { kind: "rate-limited"; until: number }
  | { kind: "stop"; error: string };

const attemptBlock = async (
  session: XSession,
  userId: string
): Promise<Attempt> => {
  try {
    await session.client.block({ userId });
    return { kind: "outcome", outcome: { kind: "blocked" } };
  } catch (error) {
    if (error instanceof XRateLimitError) {
      return {
        kind: "rate-limited",
        until: error.resetAt + RATE_LIMIT_MARGIN_MS,
      };
    }
    if (error instanceof XAuthError) {
      return { error: error.message, kind: "stop" };
    }
    if (error instanceof XTargetUnavailableError) {
      return {
        kind: "outcome",
        outcome: { kind: "skipped", reason: "unavailable" },
      };
    }
    const reason = error instanceof Error ? error.message : String(error);
    return {
      kind: "outcome",
      outcome: {
        kind: "failed",
        reason,
        retryable: error instanceof XRequestError && error.retryable,
      },
    };
  }
};

/** Does one unit of work and returns how long to wait before the next. */
const step = async (session: XSession): Promise<number> => {
  const runner = await runnerItem.getValue();
  if (runner.status !== "running") {
    return MAX_WAIT_MS;
  }
  const rateLimitWait = (runner.rateLimitedUntil ?? 0) - Date.now();
  if (rateLimitWait > 0) {
    return rateLimitWait;
  }
  const entry = nextPending(await queueItem.getValue());
  if (!entry) {
    await send({ patch: { status: "idle" }, type: "runner/update" });
    return 0;
  }
  const attempt = await attemptBlock(session, entry.userId);
  if (attempt.kind === "rate-limited") {
    await send({
      patch: { rateLimitedUntil: attempt.until },
      type: "runner/update",
    });
    return 0;
  }
  if (attempt.kind === "stop") {
    await send({
      patch: { lastError: attempt.error, status: "paused" },
      type: "runner/update",
    });
    return 0;
  }
  await send({
    outcome: attempt.outcome,
    type: "queue/outcome",
    userId: entry.userId,
  });
  if (runner.lastError || runner.rateLimitedUntil) {
    await send({
      patch: { lastError: null, rateLimitedUntil: null },
      type: "runner/update",
    });
  }
  const { blockDelayMs } = await readSettings();
  return jitteredDelay(blockDelayMs);
};

/**
 * Blocks the queued accounts one at a time while the runner state is
 * "running". Every open x.com tab calls this, but a Web Lock lets only one of
 * them work; when that tab closes, the next one takes over.
 */
export const startBlockRunner = (
  ctx: ContentScriptContext,
  session: XSession
) => {
  const work = async () => {
    const heartbeat = ctx.setInterval(
      () => runnerHeartbeatItem.setValue(Date.now()),
      HEARTBEAT_MS
    );
    await runnerHeartbeatItem.setValue(Date.now());
    try {
      while (ctx.isValid) {
        const wait = await step(session);
        if (wait > 0) {
          await waitOrRunnerChange(wait);
        }
      }
    } finally {
      clearInterval(heartbeat);
    }
  };

  navigator.locks.request(LOCK_NAME, work).catch(() => undefined);
};
