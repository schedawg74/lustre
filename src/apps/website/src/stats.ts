import { createLustreApi } from "@lustre/api/client";
import type { StatsResponse } from "@lustre/api/v1";
import { API_URL } from "./site";

export type RecentBlock = StatsResponse["recent"][number];

export type StatsResult = { source: "live" | "sample"; stats: StatsResponse };

const MASK = "•••";

/**
 * SAMPLE DATA, not real blocks. The feed shows these invented handles until
 * the Lustre server answers `/v1/stats`. The counters never show the sample
 * numbers in a production build.
 */
export const SAMPLE_STATS: StatsResponse = {
  accountsBlocked: 48_213,
  recent: [
    "gro•••uru",
    "nft•••ily",
    "pro•••bot",
    "vib•••eer",
    "ai_•••aid",
    "hus•••ode",
    "cha•••ets",
    "thr•••boi",
    "viz•••lab",
    "slo•••ory",
  ].map((maskedHandle, index) => ({
    blockedAt: new Date(Date.UTC(2026, 10, 7, 12, index)).toISOString(),
    maskedHandle,
  })),
};

export type SlopPost = {
  age: string;
  likes: string;
  name: string;
  replies: string;
  reposts: string;
  text: string;
  views: string;
};

/**
 * Invented posts of the kind that gets an account blocked. The server stores
 * no names or post texts, so the feed pairs each masked handle with one of
 * these.
 */
export const SLOP_POSTS = [
  {
    age: "2h",
    likes: "1.2K",
    name: "Growth Guru",
    replies: "84",
    reposts: "312",
    text: "10 AI tools that will replace your job. A thread.",
    views: "98K",
  },
  {
    age: "5h",
    likes: "640",
    name: "Passive Income Pro",
    replies: "1.1K",
    reposts: "95",
    text: "I made $40k last month with one prompt. Reply GUIDE and I will send it.",
    views: "41K",
  },
  {
    age: "1h",
    likes: "2.3K",
    name: "Future Now",
    replies: "57",
    reposts: "480",
    text: "Stop scrolling. This changes everything.",
    views: "120K",
  },
  {
    age: "9h",
    likes: "910",
    name: "Top 1% Mindset",
    replies: "33",
    reposts: "205",
    text: "Most people will ignore this. The top 1% will bookmark it.",
    views: "64K",
  },
  {
    age: "3h",
    likes: "430",
    name: "Prompt Lord",
    replies: "21",
    reposts: "88",
    text: "Here is the exact AI workflow I use to post 50 times a day.",
    views: "22K",
  },
  {
    age: "6h",
    likes: "1.8K",
    name: "Hot Takes Daily",
    replies: "2.4K",
    reposts: "150",
    text: "Unpopular opinion: reading is dead. Watch my summary instead.",
    views: "210K",
  },
  {
    age: "4h",
    likes: "770",
    name: "Hustle Code",
    replies: "960",
    reposts: "61",
    text: "Follow, repost and comment AI and I will DM you the playbook.",
    views: "37K",
  },
  {
    age: "8h",
    likes: "1.5K",
    name: "Algorithm Whisperer",
    replies: "120",
    reposts: "390",
    text: "Big if true. Like and repost so the algorithm sees it.",
    views: "88K",
  },
] as const satisfies readonly SlopPost[];

const EMOJI = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}/gu;

/**
 * A handle for display: `@` and the masked value. A value without the mask
 * is masked like the server does: the first and last three characters, or
 * only the first one when the handle is shorter than 7 characters.
 */
export const displayHandle = (maskedHandle: string): string => {
  const value = maskedHandle.replace(EMOJI, "").replace(/^@/, "");
  if (value.includes(MASK)) {
    return `@${value}`;
  }
  return value.length < 7
    ? `@${value.slice(0, 1)}${MASK}`
    : `@${value.slice(0, 3)}${MASK}${value.slice(-3)}`;
};

const SAMPLE: StatsResult = { source: "sample", stats: SAMPLE_STATS };

/**
 * Public stats from the Lustre server. Falls back to the sample data when
 * API_URL is unset, the request fails, or the answer does not match the
 * schema in `@lustre/api`.
 */
export const fetchStats = async (): Promise<StatsResult> => {
  if (!API_URL) {
    return SAMPLE;
  }
  try {
    const stats = await createLustreApi({ baseUrl: API_URL, fetch }).stats();
    return { source: "live", stats };
  } catch {
    return SAMPLE;
  }
};
