import { Icon } from "@lustre/icons/react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  estimateHoursSavedPerWeek,
  estimatePostsHiddenPerWeek,
  POSTS_PER_ACCOUNT_PER_WEEK,
  SECONDS_PER_POST,
} from "../estimates";
import {
  EXCERPTS,
  fetchStats,
  type RecentBlock,
  SAMPLE_STATS,
  type StatsResult,
} from "../stats";

/** Cards that stay on screen; one more arrives or leaves at a time. */
const SETTLED_CARDS = 4;
/** Half of the cycle: a card arrives, then its thumb turns. */
const HALF_STEP_MS = 1300;
const COUNT_UP_MS = 1800;

type CardState = "arriving" | "blocked" | "leaving";
type Card = { excerpt: string; handle: string; id: number; state: CardState };
type Feed = { cards: Card[]; cursor: number };
type FeedAction =
  | { recent: RecentBlock[]; type: "arrive" | "reset" }
  | { type: "strike" };

const cardAt = (
  recent: RecentBlock[],
  cursor: number,
  state: CardState
): Card => ({
  excerpt: EXCERPTS[(cursor * 3) % EXCERPTS.length] ?? EXCERPTS[0],
  handle: recent[cursor % recent.length]?.maskedHandle ?? "",
  id: cursor,
  state,
});

const initialFeed = (recent: RecentBlock[]): Feed => ({
  cards: Array.from({ length: SETTLED_CARDS }, (_, index) =>
    cardAt(recent, SETTLED_CARDS - 1 - index, "blocked")
  ),
  cursor: SETTLED_CARDS,
});

const feedReducer = (feed: Feed, action: FeedAction): Feed => {
  if (action.type === "reset") {
    return initialFeed(action.recent);
  }
  if (action.type === "strike") {
    return {
      ...feed,
      cards: feed.cards.map((card) =>
        card.state === "arriving" ? { ...card, state: "blocked" } : card
      ),
    };
  }
  const kept = feed.cards.filter((card) => card.state !== "leaving");
  return {
    cards: [
      cardAt(action.recent, feed.cursor, "arriving"),
      ...kept.map(
        (card, index): Card =>
          index >= SETTLED_CARDS - 1 ? { ...card, state: "leaving" } : card
      ),
    ],
    cursor: feed.cursor + 1,
  };
};

/** Server render and first client render: no motion, so the static page is complete. */
const useMedia = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true
  );

const usePageVisible = (): boolean =>
  useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => !document.hidden,
    () => false
  );

const useOnScreen = (ref: RefObject<Element | null>): boolean => {
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry?.isIntersecting ?? false)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return onScreen;
};

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

const FeedCard = ({ card }: { card: Card }) => (
  <li className="feed-card" data-state={card.state}>
    <div className="min-h-0 overflow-hidden">
      <div className="mb-3 flex gap-4 rounded-stone border border-line bg-surface p-4">
        <Icon className="feed-thumb mt-0.5 shrink-0" name="pollice" size={22} />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-3">
            <span className="feed-chisel font-medium">{card.handle}</span>
            <span className="feed-verdict inscription text-[0.65rem] text-muted">
              Blocked
            </span>
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            <span className="feed-chisel">{card.excerpt}</span>
          </p>
        </div>
      </div>
    </div>
  </li>
);

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

/**
 * The hero (children), the feed of recently blocked accounts beside it, and
 * the counters below. Data comes from the Lustre server when it is set,
 * otherwise from the sample data.
 */
export const LiveStats = ({ children }: { children?: ReactNode }) => {
  const [result, setResult] = useState<StatsResult>({
    source: "sample",
    stats: SAMPLE_STATS,
  });
  const { accountsBlocked, recent } = result.stats;
  const [feed, dispatch] = useReducer(feedReducer, recent, initialFeed);
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const pageVisible = usePageVisible();
  const feedRef = useRef<HTMLDivElement>(null);
  const countersRef = useRef<HTMLDListElement>(null);
  const feedOnScreen = useOnScreen(feedRef);
  const countersOnScreen = useOnScreen(countersRef);
  const progress = useCountUp(countersOnScreen && !reducedMotion);
  const running = feedOnScreen && pageVisible && !reducedMotion;

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal).then((next) => {
      setResult(next);
      if (next.source === "live") {
        dispatch({ recent: next.stats.recent, type: "reset" });
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!running) {
      return;
    }
    let arrive = true;
    const timer = setInterval(() => {
      dispatch(arrive ? { recent, type: "arrive" } : { type: "strike" });
      arrive = !arrive;
    }, HALF_STEP_MS);
    return () => clearInterval(timer);
  }, [running, recent]);

  const shown = reducedMotion ? 1 : progress;
  const counters = [
    { label: "Accounts blocked", value: accountsBlocked },
    {
      label: "Posts and replies hidden per week (estimate)",
      value: estimatePostsHiddenPerWeek(accountsBlocked),
    },
    {
      label: "Hours saved per week (estimate)",
      value: estimateHoursSavedPerWeek(accountsBlocked),
    },
  ];

  return (
    <div className="grid items-center gap-x-16 gap-y-12 lg:grid-cols-2">
      <div>{children}</div>
      <div>
        <p className="sr-only">
          An animated list shows AI-slop accounts that Lustre users blocked,
          with masked handles.
        </p>
        <div
          aria-hidden="true"
          className="mask-b-from-75% h-[27rem] overflow-hidden sm:h-[25rem]"
          ref={feedRef}
        >
          <ul>
            {feed.cards.map((card) => (
              <FeedCard card={card} key={card.id} />
            ))}
          </ul>
        </div>
      </div>
      <div className="lg:col-span-2">
        <dl className="grid gap-6 sm:grid-cols-3" ref={countersRef}>
          {counters.map((counter) => (
            <Counter
              key={counter.label}
              label={counter.label}
              shown={shown}
              value={counter.value}
            />
          ))}
        </dl>
        <p className="mt-6 text-muted text-sm">
          Estimates assume each blocked account would show about{" "}
          {POSTS_PER_ACCOUNT_PER_WEEK} posts or replies per week in one feed,
          read for about {SECONDS_PER_POST} seconds each.
          {result.source === "sample"
            ? " Sample data: live numbers appear when the shared blocklist launches."
            : null}
        </p>
      </div>
    </div>
  );
};
