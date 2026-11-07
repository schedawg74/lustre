/** DOM helpers for x.com. Selectors that x.com may change live here. */

export const SELECTORS = {
  actionBar: '[role="group"]',
  authorName: '[data-testid="User-Name"]',
  caret: '[data-testid="caret"]',
  confirmButton: '[data-testid="confirmationSheetConfirm"]',
  menuItem: '[role="menu"] [role="menuitem"]',
  profileLink: 'a[data-testid="AppTabBar_Profile_Link"]',
  replyButton: '[data-testid="reply"]',
  tweet: 'article[data-testid="tweet"]',
  tweetCell: '[data-testid="cellInnerDiv"]',
  userCell: '[data-testid="UserCell"]',
} as const;

const HANDLE_PATH = /^\/([A-Za-z0-9_]{1,15})$/;

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Polls `find` every 50 ms until it returns an element or time runs out. */
export const waitForElement = async <T extends Element>(
  find: () => T | null | undefined,
  timeoutMs: number
): Promise<T | undefined> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const element = find();
    if (element) {
      return element;
    }
    await sleep(50);
  }
};

/** The @handle of the post's author (the original author for reposts). */
export const readAuthorHandle = (article: Element): string | undefined => {
  const links = article.querySelectorAll<HTMLAnchorElement>(
    `${SELECTORS.authorName} a[href]`
  );
  for (const link of links) {
    const match = HANDLE_PATH.exec(link.getAttribute("href") ?? "");
    if (match?.[1]) {
      return match[1];
    }
  }
};

/** The @handle of the logged-in account, read from the side navigation. */
export const readOwnHandle = (): string | undefined => {
  const href = document
    .querySelector(SELECTORS.profileLink)
    ?.getAttribute("href");
  return HANDLE_PATH.exec(href ?? "")?.[1];
};

/** The action bar under a post (reply, repost, like, ...). */
export const findActionBar = (article: Element): Element | undefined => {
  const groups = article.querySelectorAll(SELECTORS.actionBar);
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group?.querySelector(SELECTORS.replyButton)) {
      return group;
    }
  }
};

const HIDDEN_CLASS = "lustre-hidden";

/** Hides the timeline cell of a post. Returns a function that shows it again. */
export const hideTweet = (article: Element): (() => void) => {
  const cell = article.closest(SELECTORS.tweetCell) ?? article;
  cell.classList.add(HIDDEN_CLASS);
  return () => cell.classList.remove(HIDDEN_CLASS);
};
