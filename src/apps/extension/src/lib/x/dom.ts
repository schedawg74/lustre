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

const SVG_NS = "http://www.w3.org/2000/svg";

/** Builds a 24×24 outline icon without innerHTML (x.com uses Trusted Types). */
export const icon = (paths: readonly string[]): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
};

export const ICONS = {
  block: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z", "M5.6 5.6l12.8 12.8"],
  mute: ["M4 9h4l5-4v14l-5-4H4z", "M16.5 9.5l5 5", "M21.5 9.5l-5 5"],
  notInterested: [
    "M3 3l18 18",
    "M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 9 7c0 .9-.8 2.4-2.2 3.8",
    "M6.6 6.6C4.4 8 3 10.6 3 12c0 2 4 7 9 7c1.9 0 3.6-.7 5-1.6",
    "M9.9 9.9a3 3 0 0 0 4.2 4.2",
  ],
} as const;
