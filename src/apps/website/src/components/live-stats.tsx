import { ICON_VIEWBOX } from "@lustre/icons/icons";
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
} from "../estimates";
import {
  displayHandle,
  fetchStats,
  type RecentBlock,
  SAMPLE_STATS,
  SLOP_POSTS,
  type SlopPost,
  type StatsResult,
} from "../stats";

/** Cards that stay on screen; one more arrives or leaves at a time. */
const SETTLED_CARDS = 4;
/** Half of the cycle: a card arrives, then its thumb turns. */
const HALF_STEP_MS = 1300;
const COUNT_UP_MS = 1800;

/** Post actions, drawn in the Meandros style (straight lines, square caps). */
const POST_ACTIONS = [
  { d: "M4 5H20V16H11L6 20V16H4Z", key: "replies" },
  {
    d: "M4 13V7H17 M14 4L17 7L14 10 M20 11V17H7 M10 14L7 17L10 20",
    key: "reposts",
  },
  { d: "M12 20L4 12V7L7 4H9L12 7L15 4H17L20 7V12Z", key: "likes" },
  { d: "M6 19V12 M12 19V5 M18 19V10", key: "views" },
] as const;

type CardState = "arriving" | "blocked" | "leaving";
type Card = { handle: string; id: number; post: SlopPost; state: CardState };
type Feed = { cards: Card[]; cursor: number };
type FeedAction =
  | { recent: RecentBlock[]; type: "arrive" | "reset" }
  | { type: "strike" };

const cardAt = (
  recent: RecentBlock[],
  cursor: number,
  state: CardState
): Card => ({
  handle: displayHandle(recent[cursor % recent.length]?.maskedHandle ?? ""),
  id: cursor,
  post: SLOP_POSTS[(cursor * 3) % SLOP_POSTS.length] ?? SLOP_POSTS[0],
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

const initials = (name: string): string =>
  name
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("");

const FeedCard = ({ card: { handle, post, state } }: { card: Card }) => (
  <li className="feed-card" data-state={state}>
    <div className="min-h-0 overflow-hidden">
      <div className="feed-post mb-3 flex gap-3 rounded-stone border border-line p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-line font-medium text-sm text-text">
          {initials(post.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="feed-chisel font-bold">{post.name}</span>{" "}
              <span className="feed-chisel text-muted">{handle}</span>
              <span className="text-muted"> · {post.age}</span>
            </p>
            <Icon className="feed-thumb shrink-0" name="pollice" size={18} />
          </div>
          <p className="mt-1 text-[0.95rem] leading-snug">
            <span className="feed-chisel">{post.text}</span>
          </p>
          <div className="relative mt-3 text-muted text-xs">
            <ul className="feed-actions flex max-w-xs justify-between">
              {POST_ACTIONS.map((action) => (
                <li className="flex items-center gap-1.5" key={action.key}>
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height={15}
                    stroke="currentColor"
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                    strokeWidth={2}
                    viewBox={ICON_VIEWBOX}
                    width={15}
                  >
                    <path d={action.d} />
                  </svg>
                  {post[action.key]}
                </li>
              ))}
            </ul>
            <p className="feed-verdict inscription absolute inset-0 flex items-center text-[0.65rem]">
              Blocked by Lustre
            </p>
          </div>
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

const Counters = ({
  accountsBlocked,
  reducedMotion,
}: {
  accountsBlocked: number;
  reducedMotion: boolean;
}) => {
  const ref = useRef<HTMLDListElement>(null);
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
 * The hero (children), the feed of recently blocked accounts beside it, and
 * the counters below. The counters need live data from the Lustre server;
 * with the sample data they show only in development.
 */
export const LiveStats = ({ children }: { children?: ReactNode }) => {
  const [result, setResult] = useState<StatsResult>({
    source: "sample",
    stats: SAMPLE_STATS,
  });
  const recent =
    result.stats.recent.length > 0 ? result.stats.recent : SAMPLE_STATS.recent;
  const [feed, dispatch] = useReducer(feedReducer, recent, initialFeed);
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const pageVisible = usePageVisible();
  const feedRef = useRef<HTMLDivElement>(null);
  const feedOnScreen = useOnScreen(feedRef);
  const running = feedOnScreen && pageVisible && !reducedMotion;
  const showCounters = result.source === "live" || import.meta.env.DEV;

  useEffect(() => {
    let active = true;
    fetchStats().then((next) => {
      if (!active) {
        return;
      }
      setResult(next);
      if (next.source === "live" && next.stats.recent.length > 0) {
        dispatch({ recent: next.stats.recent, type: "reset" });
      }
    });
    return () => {
      active = false;
    };
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

  return (
    <div className="grid items-center gap-x-16 gap-y-12 lg:grid-cols-2">
      <div>{children}</div>
      <div>
        <p className="sr-only">
          An animated list shows AI-slop posts whose authors Lustre users
          blocked, with masked handles.
        </p>
        <div
          aria-hidden="true"
          className="mask-b-from-75% h-[30rem] overflow-hidden"
          ref={feedRef}
        >
          <ul>
            {feed.cards.map((card) => (
              <FeedCard card={card} key={card.id} />
            ))}
          </ul>
        </div>
      </div>
      {showCounters ? (
        <Counters
          accountsBlocked={result.stats.accountsBlocked}
          reducedMotion={reducedMotion}
        />
      ) : null}
    </div>
  );
};
