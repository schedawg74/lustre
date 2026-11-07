import { type EntryStatus, summarize } from "@lustre/block-queue/queue";
import { ICONS } from "@lustre/icons/icons";
import { useId, useMemo } from "react";
import { send } from "@/lib/messages";
import { queueItem, runnerHeartbeatItem, runnerItem } from "@/lib/storage";
import { formatCount, formatTime } from "./format";
import { Button, linkClass } from "./ui";
import { useNow, useStorageItem } from "./use-storage-item";

const HEARTBEAT_STALE_MS = 15_000;

/** The vessels of the clepsydra icon, as fill areas on its 24-unit grid. */
const UPPER_VESSEL = "M7 3H17V7L12 12L7 7Z";
const LOWER_VESSEL = "M7 21H17V17L12 12L7 17Z";
/** The lower vessel spans y 12 to 21. */
const LOWER_TOP = 12;
const LOWER_HEIGHT = 9;

/**
 * A water clock that fills as accounts are blocked. While blocking runs, a
 * drop falls from the upper vessel; it holds still for reduced motion.
 */
export const Clepsydra = ({
  progress,
  running,
}: {
  progress: number;
  running: boolean;
}) => {
  const clipId = `clepsydra-${useId().replaceAll(":", "")}`;
  const level = Math.min(1, Math.max(0, progress));
  const fillTop = LOWER_TOP + LOWER_HEIGHT * (1 - level);
  return (
    <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 24 24">
      <defs>
        <clipPath id={`${clipId}-low`}>
          <path d={LOWER_VESSEL} />
        </clipPath>
        <clipPath id={`${clipId}-up`}>
          <path d={UPPER_VESSEL} />
        </clipPath>
      </defs>
      <rect
        className="fill-accent/35 transition-[y] duration-700"
        clipPath={`url(#${clipId}-up)`}
        height={9}
        width={10}
        x={7}
        y={3 + 9 * level}
      />
      <rect
        className="fill-accent transition-[y] duration-700"
        clipPath={`url(#${clipId}-low)`}
        height={21 - fillTop}
        width={10}
        x={7}
        y={fillTop}
      />
      {running ? (
        <rect
          className="fill-accent motion-safe:animate-[clepsydra-drip_1.2s_linear_infinite] motion-reduce:hidden"
          height={2}
          width={1.5}
          x={11.25}
          y={12}
        />
      ) : null}
      <path
        d={ICONS.clepsydra.d}
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeWidth={2}
      />
    </svg>
  );
};

/**
 * The one place that shows blocking: a water clock, a short status, the
 * action that fits the state, and a link to the accounts. Shows nothing
 * when there is nothing to block.
 */
/** Picks the status line and the one control for the header. */
const describe = ({
  pending,
  failed,
  status,
  rateLimitedUntil,
  tabMissing,
  now,
}: {
  pending: number;
  failed: number;
  status: "idle" | "running" | "paused";
  rateLimitedUntil: number;
  tabMissing: boolean;
  now: number;
}): { label: string; action: "pause" | "resume" | "start" | "retry" } => {
  const left = `${formatCount(pending)} left`;
  if (status === "running") {
    if (rateLimitedUntil > now) {
      return {
        action: "pause",
        label: `X limit, resumes ${formatTime(rateLimitedUntil)}`,
      };
    }
    return {
      action: "pause",
      label: tabMissing ? `Waiting for x.com, ${left}` : left,
    };
  }
  if (pending > 0) {
    return status === "paused"
      ? { action: "resume", label: `Paused, ${left}` }
      : { action: "start", label: `${formatCount(pending)} to block` };
  }
  return { action: "retry", label: `${formatCount(failed)} failed` };
};

const ACTION_LABELS = {
  pause: "Pause",
  resume: "Resume",
  retry: "Retry",
  start: "Start",
} as const;

/**
 * The one place that shows blocking: a water clock, a short status, the
 * action that fits the state, and a link to the accounts. Shows nothing
 * when nothing is queued or failed.
 */
export const Activity = ({
  onShowAccounts,
}: {
  onShowAccounts: (filter: EntryStatus) => void;
}) => {
  const queue = useStorageItem(queueItem);
  const runner = useStorageItem(runnerItem);
  const heartbeat = useStorageItem(runnerHeartbeatItem);
  const now = useNow(2000);
  const summary = useMemo(() => summarize(queue), [queue]);
  const { pending, blocked, failed } = summary;
  const running = runner.status === "running";

  if (pending === 0 && failed === 0 && !running) {
    return null;
  }

  const rateLimitedUntil = runner.rateLimitedUntil ?? 0;
  const tabMissing = running && now - heartbeat > HEARTBEAT_STALE_MS;
  const { label, action } = describe({
    failed,
    now,
    pending,
    rateLimitedUntil,
    status: runner.status,
    tabMissing,
  });

  const act = () => {
    if (action === "retry") {
      send({ type: "queue/retryFailed" });
      return;
    }
    send({
      patch: {
        lastError: null,
        status: action === "pause" ? "paused" : "running",
      },
      type: "runner/update",
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        className={`flex items-center gap-1.5 text-xs tabular-nums hover:text-accent ${action === "retry" ? "text-danger" : "text-text"} ${linkClass}`}
        onClick={() =>
          onShowAccounts(action === "retry" ? "failed" : "pending")
        }
        title="Show accounts"
        type="button"
      >
        <Clepsydra
          progress={blocked / Math.max(1, blocked + pending)}
          running={running && rateLimitedUntil <= now && !tabMissing}
        />
        <span aria-live="polite">{label}</span>
      </button>
      <Button onClick={act} variant={action === "pause" ? "quiet" : "primary"}>
        {ACTION_LABELS[action]}
      </Button>
    </div>
  );
};

/** Problems that stop blocking, shown under the header. */
export const ActivityNotices = () => {
  const runner = useStorageItem(runnerItem);
  const heartbeat = useStorageItem(runnerHeartbeatItem);
  const now = useNow(2000);
  const tabMissing =
    runner.status === "running" && now - heartbeat > HEARTBEAT_STALE_MS;
  if (!(runner.lastError || tabMissing)) {
    return null;
  }
  return (
    <div className="px-5 pb-2 text-xs leading-snug">
      {runner.lastError ? (
        // The runner stops only for session errors (see block-runner.ts).
        <p className="text-danger" role="alert" title={runner.lastError}>
          X signed you out or refused the session. Sign in on{" "}
          <a
            className={`underline ${linkClass}`}
            href="https://x.com/login"
            rel="noopener"
            target="_blank"
          >
            x.com
          </a>
          , then press Resume.
        </p>
      ) : (
        <p className="text-muted">
          Open{" "}
          <a
            className={`text-accent underline ${linkClass}`}
            href="https://x.com/home"
            rel="noopener"
            target="_blank"
          >
            x.com
          </a>{" "}
          to continue. Blocking runs in an x.com tab.
        </p>
      )}
    </div>
  );
};
