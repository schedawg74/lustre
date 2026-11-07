import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  estimateHoursSavedPerWeek,
  estimatePostsHiddenPerWeek,
} from "../estimates";
import { fetchStats, SAMPLE_STATS, type StatsResult } from "../stats";
import { useMedia, useOnScreen } from "./hooks";
import { XTimeline } from "./x-timeline";

const COUNT_UP_MS = 1800;

/** 0 to 1 over COUNT_UP_MS, once `start` is true. */
const useCountUp = (start: boolean): number => {
  const [progress, setProgress] = useState(0);
  const done = progress === 1;
  useEffect(() => {
    if (!start || done) {
      return;
    }
    let frame = 0;
    let first = 0;
    const tick = (now: number): void => {
      first ||= now;
      const linear = Math.min(1, (now - first) / COUNT_UP_MS);
      setProgress(1 - (1 - linear) ** 3);
      if (linear < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, done]);
  return progress;
};

const formatNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const Counter = ({
  label,
  shown,
  value,
}: {
  label: string;
  shown: number;
  value: number;
}) => (
  <div className="border-line border-t pt-5">
    <dt className="text-muted text-sm">{label}</dt>
    <dd className="mt-2 font-display text-4xl text-text sm:text-5xl">
      <span aria-hidden="true">{formatNumber.format(value * shown)}</span>
      <span className="sr-only">{formatNumber.format(value)}</span>
    </dd>
  </div>
);

const Counters = ({ accountsBlocked }: { accountsBlocked: number }) => {
  const ref = useRef<HTMLDListElement>(null);
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const onScreen = useOnScreen(ref);
  const progress = useCountUp(onScreen && !reducedMotion);
  const shown = reducedMotion ? 1 : progress;
  const counters = [
    { label: "Accounts blocked", value: accountsBlocked },
    {
      label: "Posts and replies hidden per week",
      value: estimatePostsHiddenPerWeek(accountsBlocked),
    },
    {
      label: "Hours saved per week",
      value: estimateHoursSavedPerWeek(accountsBlocked),
    },
  ];
  return (
    <dl className="grid gap-6 sm:grid-cols-3 lg:col-span-2" ref={ref}>
      {counters.map((counter) => (
        <Counter
          key={counter.label}
          label={counter.label}
          shown={shown}
          value={counter.value}
        />
      ))}
    </dl>
  );
};

/**
 * The hero (children), the timeline beside it, and the counters below. The
 * counters need live data from the Lustre server; with the sample data they
 * show only in development.
 */
export const LiveStats = ({ children }: { children?: ReactNode }) => {
  const [result, setResult] = useState<StatsResult>({
    source: "sample",
    stats: SAMPLE_STATS,
  });
  const live = result.source === "live" && result.stats.recent.length > 0;

  useEffect(() => {
    let active = true;
    fetchStats().then((next) => {
      if (active) {
        setResult(next);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="grid items-center gap-x-16 gap-y-12 lg:grid-cols-2">
      <div>{children}</div>
      <XTimeline
        key={live ? "live" : "sample"}
        recent={live ? result.stats.recent : SAMPLE_STATS.recent}
      />
      {result.source === "live" || import.meta.env.DEV ? (
        <Counters accountsBlocked={result.stats.accountsBlocked} />
      ) : null}
    </div>
  );
};
