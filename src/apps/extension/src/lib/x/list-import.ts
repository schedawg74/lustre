import { parseListId, type XUser } from "@lustre/x-client/users";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { send } from "@/lib/messages";
import { isImporting } from "@/lib/pending-imports";
import { pendingImportsItem } from "@/lib/storage";
import { SELECTORS } from "./dom";
import type { XSession } from "./session";

const SCROLL_EVERY_MS = 1200;
/** No new members for this long means the end of the list. */
const IDLE_FINISH_MS = 12_000;

const MEMBERS_PATH = /^\/i\/lists\/(\d+)\/members\/?$/;

type Panel = {
  root: HTMLElement;
  /** Replaces the message. Screen readers announce it. */
  setText: (text: string) => void;
  /** A running count after the message, not announced. */
  setProgress: (text: string) => void;
  setButtons: (
    buttons: { label: string; primary?: boolean; run: () => void }[]
  ) => void;
};

const createPanel = (): Panel => {
  const root = document.createElement("div");
  root.className = "lustre-panel";
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Lustre list import");
  const title = document.createElement("strong");
  title.textContent = "Lustre";
  const text = document.createElement("p");
  const message = document.createElement("span");
  message.setAttribute("aria-live", "polite");
  const progress = document.createElement("span");
  progress.setAttribute("aria-hidden", "true");
  text.append(message, progress);
  const buttons = document.createElement("div");
  buttons.className = "lustre-panel-buttons";
  root.append(title, text, buttons);
  document.body.append(root);
  return {
    root,
    setButtons: (items) => {
      buttons.replaceChildren(
        ...items.map((item) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = item.label;
          if (item.primary) {
            button.className = "lustre-primary";
          }
          button.addEventListener("click", item.run);
          return button;
        })
      );
    },
    setProgress: (value) => {
      progress.textContent = value;
    },
    setText: (value) => {
      message.textContent = value;
      progress.textContent = "";
    },
  };
};

const finishMessage = (added: number, skipped: number) => {
  if (added === 0 && skipped === 0) {
    return "No new members.";
  }
  return skipped > 0
    ? `${added} queued. ${skipped} skipped by Safety settings or already blocked.`
    : `${added} queued.`;
};

/** Without a first page by then, fall back to scrolling. */
const FIRST_PAGE_TIMEOUT_MS = 15_000;

type Mode = "waiting" | "paging" | "scrolling";

/**
 * Collects every member of a list on the list's members page, which the
 * extension opens in a background tab.
 *
 * x.com loads the first page of members itself; the bridge forwards that
 * response and its request. The import then repeats the request with the
 * next cursor until the last page, so it does not need the page to scroll
 * or even be visible. If x.com refuses the repeated request, the import
 * falls back to scrolling the members list, which needs the tab in front.
 */
const runImport = (
  ctx: ContentScriptContext,
  session: XSession,
  listId: string
) => {
  const members = new Map<string, XUser>();
  const startedAt = Date.now();
  let lastGrowthAt = startedAt;
  let reachedEnd = false;
  let finished = false;
  let mode: Mode = "waiting";
  let unsubscribe: () => void = () => undefined;
  const panel = createPanel();

  const add = (users: readonly XUser[]) => {
    for (const user of users) {
      if (!members.has(user.id)) {
        members.set(user.id, user);
        lastGrowthAt = Date.now();
      }
    }
    panel.setProgress(` ${members.size}`);
    send({ found: members.size, listId, type: "import/progress" }).catch(
      () => undefined
    );
  };

  const stop = () => {
    finished = true;
    unsubscribe();
    clearInterval(timer);
  };

  const finish = async () => {
    if (finished) {
      return;
    }
    stop();
    panel.setText(`Adding ${members.size} members to the queue…`);
    panel.setButtons([]);
    const summary = await send({
      list: session.listInfo(listId),
      listId,
      type: "import/finish",
      users: [...members.values()],
    });
    const skipped = Object.values(summary.skipped).reduce(
      (total, count) => total + count,
      0
    );
    if (summary.cancelled) {
      panel.setText("Import stopped: the list was removed.");
      panel.setButtons([{ label: "Close", run: () => panel.root.remove() }]);
      return;
    }
    // The background worker closes this tab when the popup opened it.
    panel.setText(finishMessage(summary.added, skipped));
    panel.setButtons([{ label: "Close", run: () => panel.root.remove() }]);
  };

  const pageThrough = async (firstCursor: string) => {
    mode = "paging";
    const seen = new Set<string>();
    let cursor: string | undefined = firstCursor;
    try {
      while (cursor && !seen.has(cursor) && !finished) {
        seen.add(cursor);
        const page = await session.fetchMembersPage(listId, cursor);
        add(page.users);
        if (page.users.length === 0) {
          break;
        }
        cursor = page.nextCursor;
      }
      await finish();
    } catch {
      // x.com refused the repeated request: scroll like a person would.
      mode = "scrolling";
      lastGrowthAt = Date.now();
      panel.setText("Collecting members. Keep this tab in front…");
    }
  };

  const scroll = () => {
    const idleFor = Date.now() - lastGrowthAt;
    if (
      (reachedEnd && idleFor > SCROLL_EVERY_MS * 2) ||
      idleFor > IDLE_FINISH_MS
    ) {
      finish();
      return;
    }
    // The members page is a modal on desktop; scrolling the last row into
    // view scrolls whichever container holds it.
    const cells = document.querySelectorAll(SELECTORS.userCell);
    const last = cells.item(cells.length - 1);
    if (last) {
      last.scrollIntoView({ block: "end" });
    } else {
      window.scrollBy(0, window.innerHeight);
    }
  };

  const tick = () => {
    if (finished) {
      return;
    }
    if (mode === "waiting" && Date.now() - startedAt > FIRST_PAGE_TIMEOUT_MS) {
      mode = "scrolling";
    }
    if (mode === "scrolling") {
      scroll();
    }
  };

  panel.setText("Collecting members…");
  panel.setButtons([
    { label: "Finish", primary: true, run: () => finish() },
    {
      label: "Cancel",
      run: async () => {
        stop();
        panel.root.remove();
        await send({ listId, type: "import/cancel" });
      },
    },
  ]);
  const timer = ctx.setInterval(tick, SCROLL_EVERY_MS);
  // Subscribe last: the session replays pages that already arrived, and the
  // first one may finish the import at once.
  unsubscribe = session.onListMembers((page) => {
    if (finished || page.listId !== listId) {
      return;
    }
    if (page.users.length === 0) {
      reachedEnd = true;
    }
    add(page.users);
    if (mode !== "waiting") {
      return;
    }
    if (page.nextCursor) {
      pageThrough(page.nextCursor);
    } else {
      // The whole list fits on the first page.
      finish();
    }
  });
};

/** Starts an import when the popup asked for one and this tab shows its list. */
export const maybeStartListImport = async (
  ctx: ContentScriptContext,
  session: XSession,
  isRunning: () => boolean,
  markRunning: () => void
) => {
  const match = MEMBERS_PATH.exec(location.pathname);
  if (!match || isRunning()) {
    return;
  }
  const listId = parseListId(match[1] ?? "");
  if (
    !(
      listId &&
      isImporting(await pendingImportsItem.getValue(), listId, Date.now())
    )
  ) {
    return;
  }
  markRunning();
  runImport(ctx, session, listId);
};
