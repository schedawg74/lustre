import { API_URL } from "./site";

/** One block from the public, anonymous stats. The handle arrives masked. */
export type RecentBlock = { blockedAt: string; maskedHandle: string };

export type Stats = { accountsBlocked: number; recent: RecentBlock[] };

export type StatsResult = { source: "live" | "sample"; stats: Stats };

const MASK = "•••";

/**
 * SAMPLE DATA, not real blocks. The page shows it, with a note, until the
 * Lustre server publishes `/v1/stats`. The handles are invented.
 */
export const SAMPLE_STATS: Stats = {
  accountsBlocked: 48_213,
  recent: [
    "@slo•••uru",
    "@gro•••ack",
    "@pro•••bot",
    "@nft•••ily",
    "@vib•••eer",
    "@ai_•••aid",
    "@hus•••ode",
    "@cha•••ets",
    "@thr•••boi",
    "@viz•••lab",
  ].map((maskedHandle, index) => ({
    blockedAt: new Date(Date.UTC(2026, 10, 7, 12, index)).toISOString(),
    maskedHandle,
  })),
};

/**
 * Invented posts of the kind that gets an account blocked. The server never
 * stores post texts, so the page pairs each block with one of these.
 */
export const EXCERPTS = [
  "10 AI tools that will replace your job. A thread.",
  "I made $40k last month with one prompt. Reply GUIDE and I will send it.",
  "Stop scrolling. This changes everything.",
  "Most people will ignore this. The top 1% will bookmark it.",
  "Here is the exact AI workflow I use to post 50 times a day.",
  "Unpopular opinion: reading is dead. Watch my summary instead.",
  "Follow + retweet + comment AI and I will DM you the playbook.",
  "This one tool writes better than 99% of humans. Proof below.",
  "Big if true. Like and repost so the algorithm sees it.",
  "Nobody is talking about this. Here are 7 reasons why.",
] as const;

const EMOJI = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}/gu;

/**
 * Show at most the first and last three characters of a handle, and never
 * more than a third of a short one at each end. Masked values pass through.
 */
export const maskHandle = (handle: string): string => {
  const clean = handle.replace(EMOJI, "");
  if (clean.includes(MASK)) {
    return clean;
  }
  const name = clean.replace(/^@/, "");
  const keep = Math.min(3, Math.floor(name.length / 3));
  return `@${name.slice(0, keep)}${MASK}${keep > 0 ? name.slice(-keep) : ""}`;
};

const isStats = (value: unknown): value is Stats => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { accountsBlocked, recent } = value as Partial<Stats>;
  return (
    typeof accountsBlocked === "number" &&
    Number.isFinite(accountsBlocked) &&
    Array.isArray(recent) &&
    recent.every(
      (item: Partial<RecentBlock>) =>
        typeof item?.maskedHandle === "string" &&
        typeof item.blockedAt === "string"
    )
  );
};

const SAMPLE: StatsResult = { source: "sample", stats: SAMPLE_STATS };

/**
 * Public stats from the Lustre server. Falls back to the sample data when
 * API_URL is unset, the request fails, or the answer has another shape.
 */
export const fetchStats = async (
  signal?: AbortSignal
): Promise<StatsResult> => {
  if (!API_URL) {
    return SAMPLE;
  }
  try {
    const response = await fetch(`${API_URL}/v1/stats`, {
      headers: { accept: "application/json" },
      signal,
    });
    const body: unknown = response.ok ? await response.json() : null;
    if (!isStats(body) || body.recent.length === 0) {
      return SAMPLE;
    }
    return {
      source: "live",
      stats: {
        accountsBlocked: body.accountsBlocked,
        recent: body.recent.map((item) => ({
          blockedAt: item.blockedAt,
          maskedHandle: maskHandle(item.maskedHandle),
        })),
      },
    };
  } catch {
    return SAMPLE;
  }
};
