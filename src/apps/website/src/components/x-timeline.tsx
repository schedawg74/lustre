import { Icon } from "@lustre/icons/react";
import { useEffect, useId, useReducer, useRef } from "react";
import {
  displayHandle,
  type RecentBlock,
  SLOP_POSTS,
  type SlopPost,
} from "../stats";
import { useMedia, useOnScreen, usePageVisible } from "./hooks";

/*
 * A social timeline as it looks on the web (layout and colors only, no
 * logo or name), with the three buttons that the Lustre extension adds to
 * each post. Every new post is blocked with the Block button.
 */

/** Phases of one cycle and how long each lasts: 2.6 s per post. */
const PHASES = [
  ["enter", 600],
  ["rest", 450],
  ["hover", 400],
  ["press", 250],
  ["collapse", 900],
] as const;

type Phase = (typeof PHASES)[number][0];
type PostState = "entering" | "idle" | "hover" | "press" | "collapsing";
type Post = { handle: string; id: number; slop: SlopPost; state: PostState };
type Timeline = {
  cursor: number;
  phase: Phase;
  posts: Post[];
  toast: { handle: string; id: number } | null;
};

/**
 * Posts kept below the newest one. The panel shows about four; the others
 * are pushed out of view at the bottom, as on a real timeline.
 */
const KEPT_POSTS = 5;

const postAt = (recent: RecentBlock[], cursor: number, state: PostState) => ({
  handle: displayHandle(recent[cursor % recent.length]?.maskedHandle ?? ""),
  id: cursor,
  slop: SLOP_POSTS[(cursor * 3) % SLOP_POSTS.length] ?? SLOP_POSTS[0],
  state,
});

const initialTimeline = (recent: RecentBlock[]): Timeline => ({
  cursor: KEPT_POSTS,
  phase: "collapse",
  posts: Array.from({ length: KEPT_POSTS }, (_, index) =>
    postAt(recent, KEPT_POSTS - 1 - index, "idle")
  ),
  toast: null,
});

const nextPhase = (phase: Phase): Phase => {
  const index = PHASES.findIndex(([name]) => name === phase);
  return PHASES[(index + 1) % PHASES.length]?.[0] ?? "enter";
};

const withNewest = (posts: Post[], state: PostState): Post[] =>
  posts.map((post, index) => (index === 0 ? { ...post, state } : post));

const timelineReducer = (
  timeline: Timeline,
  recent: RecentBlock[]
): Timeline => {
  const phase = nextPhase(timeline.phase);
  switch (phase) {
    case "enter":
      return {
        ...timeline,
        cursor: timeline.cursor + 1,
        phase,
        posts: [
          postAt(recent, timeline.cursor, "entering"),
          ...timeline.posts
            .filter((post) => post.state !== "collapsing")
            .slice(0, KEPT_POSTS),
        ],
      };
    case "rest":
      return {
        ...timeline,
        phase,
        posts: withNewest(timeline.posts, "idle"),
        toast: null,
      };
    case "collapse":
      return {
        ...timeline,
        phase,
        posts: withNewest(timeline.posts, "collapsing"),
        toast: timeline.posts[0] ?? null,
      };
    default:
      return { ...timeline, phase, posts: withNewest(timeline.posts, phase) };
  }
};

/** Outline icons in the familiar shapes of a timeline, drawn for this page. */
const ICON_PATHS = {
  bookmark: "M6.5 4h11v16l-5.5-4-5.5 4z",
  like: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z",
  reply: "M9 4.5h6a5.5 5.5 0 0 1 0 11h-2.5l-5 4v-4.1A5.5 5.5 0 0 1 9 4.5z",
  repost:
    "M7 4.5 4.5 7 7 9.5 M4.5 7h10a3 3 0 0 1 3 3v2 M17 19.5l2.5-2.5-2.5-2.5 M19.5 17h-10a3 3 0 0 1-3-3v-2",
  share: "M12 3.5v11 M7.5 8 12 3.5 16.5 8 M4.5 13.5v6h15v-6",
  views: "M6 20v-7 M12 20V5 M18 20v-10",
} as const;

const XIcon = ({ name }: { name: keyof typeof ICON_PATHS }) => (
  <svg
    aria-hidden="true"
    className="x-icon"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.75}
    viewBox="0 0 24 24"
  >
    <path d={ICON_PATHS[name]} />
  </svg>
);

/** A rosette with 12 scallops, drawn as a star with rounded joins. */
const ROSETTE = Array.from({ length: 24 }, (_, index) => {
  const angle = (index / 24) * Math.PI * 2;
  const radius = index % 2 === 0 ? 10.5 : 8.6;
  return `${(12 + radius * Math.sin(angle)).toFixed(2)},${(12 - radius * Math.cos(angle)).toFixed(2)}`;
}).join(" ");

const VerifiedBadge = () => (
  <svg aria-hidden="true" className="x-badge" viewBox="0 0 24 24">
    <polygon
      fill="#1d9bf0"
      points={ROSETTE}
      stroke="#1d9bf0"
      strokeLinejoin="round"
      strokeWidth={1.5}
    />
    <path
      d="M8 12.4l2.7 2.7L16.2 9.4"
      fill="none"
      stroke="#ffffff"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.2}
    />
  </svg>
);

const hue = (text: string): number => {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  }
  return hash;
};

/** An abstract profile picture: head and shoulders on a gradient. */
const Avatar = ({ seed }: { seed: string }) => {
  const id = useId();
  const base = hue(seed);
  return (
    <svg
      aria-hidden="true"
      className="size-10 rounded-full"
      viewBox="0 0 40 40"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={`hsl(${base} 62% 62%)`} />
          <stop offset="1" stopColor={`hsl(${(base + 40) % 360} 58% 38%)`} />
        </linearGradient>
      </defs>
      <rect fill={`url(#${id})`} height="40" width="40" />
      <circle cx="20" cy="16" fill="rgba(255,255,255,0.82)" r="7" />
      <ellipse cx="20" cy="37" fill="rgba(255,255,255,0.82)" rx="13" ry="10" />
    </svg>
  );
};

const LUSTRE_BUTTONS = [
  { icon: "pollice", key: "block" },
  { icon: "tacita", key: "mute" },
  { icon: "aversio", key: "notInterested" },
] as const;

const TimelinePost = ({ post }: { post: Post }) => {
  const { handle, slop, state } = post;
  return (
    <li className="x-post" data-state={state}>
      <div className="min-h-0 overflow-hidden">
        <div className="x-post-body grid grid-cols-[40px_1fr] gap-x-3 px-4 py-3">
          <Avatar seed={handle} />
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[15px] leading-5">
              <span className="truncate font-bold text-[var(--x-text)]">
                {slop.name}
              </span>
              <VerifiedBadge />
              <span className="min-w-0 shrink truncate text-[var(--x-muted)]">
                {handle} · {slop.age}
              </span>
              <svg
                aria-hidden="true"
                className="x-icon ml-auto shrink-0 text-[var(--x-muted)]"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </div>
            <p className="line-clamp-3 text-[15px] text-[var(--x-text)] leading-5">
              {slop.text}
            </p>
            <div className="x-actions mt-3 flex max-w-[425px] items-center justify-between gap-x-2 text-[13px] text-[var(--x-muted)]">
              <span className="x-action">
                <XIcon name="reply" />
                {slop.replies}
              </span>
              <span className="x-action">
                <XIcon name="repost" />
                {slop.reposts}
              </span>
              <span className="x-action">
                <XIcon name="like" />
                {slop.likes}
              </span>
              <span className="x-action x-views">
                <XIcon name="views" />
                {slop.views}
              </span>
              <span className="flex items-center gap-3">
                <span className="x-action x-bookmark">
                  <XIcon name="bookmark" />
                </span>
                <span className="x-action">
                  <XIcon name="share" />
                </span>
                <span className="lustre-actions">
                  {LUSTRE_BUTTONS.map((button) => (
                    <span
                      className={`lustre-action lustre-action-${button.key}`}
                      key={button.key}
                    >
                      <Icon name={button.icon} size={18} />
                    </span>
                  ))}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
};

/**
 * The timeline beside the hero. New posts slide in at the top; the Block
 * button of the newest one is hovered and pressed, the post collapses, and
 * the extension's toast confirms. Static with reduced motion; paused off
 * screen and in a hidden tab. Give it a new `key` to restart it with other
 * data.
 */
export const XTimeline = ({ recent }: { recent: RecentBlock[] }) => {
  const [timeline, dispatch] = useReducer(
    timelineReducer,
    recent,
    initialTimeline
  );
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const pageVisible = usePageVisible();
  const panelRef = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(panelRef);
  const running = onScreen && pageVisible && !reducedMotion;

  useEffect(() => {
    if (!running) {
      return;
    }
    const delay = PHASES.find(([name]) => name === timeline.phase)?.[1] ?? 600;
    const timer = setTimeout(() => dispatch(recent), delay);
    return () => clearTimeout(timer);
  }, [running, timeline.phase, recent]);

  return (
    <div>
      <p className="sr-only">
        An animated timeline shows AI-slop posts that the Lustre Block button
        removes one by one, with masked handles.
      </p>
      <div
        aria-hidden="true"
        className="x-timeline relative h-[30rem] overflow-hidden max-sm:-mx-4 sm:mx-auto sm:max-w-[600px]"
        ref={panelRef}
      >
        <ul>
          {timeline.posts.map((post) => (
            <TimelinePost key={post.id} post={post} />
          ))}
        </ul>
        {timeline.toast ? (
          <div className="lustre-toast" key={timeline.toast.id}>
            <span>Blocked {timeline.toast.handle}</span>
            <span className="lustre-toast-undo">Undo</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
