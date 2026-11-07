/**
 * Assumptions behind the counters for hidden posts and saved time. The page
 * does not show them; change them here only.
 */

/** Posts and replies of one blocked account that one feed shows per week. */
export const POSTS_PER_ACCOUNT_PER_WEEK = 3;

/** Seconds a reader spends on one such post before scrolling on. */
export const SECONDS_PER_POST = 6;

export const estimatePostsHiddenPerWeek = (accountsBlocked: number): number =>
  accountsBlocked * POSTS_PER_ACCOUNT_PER_WEEK;

export const estimateHoursSavedPerWeek = (accountsBlocked: number): number =>
  (estimatePostsHiddenPerWeek(accountsBlocked) * SECONDS_PER_POST) / 3600;
