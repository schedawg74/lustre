import { parseListId, type XUser } from "@lustre/x-client/users";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { send } from "@/lib/messages";
import { pendingImportItem } from "@/lib/storage";
import { SELECTORS } from "./dom";
import type { XSession } from "./session";

const SCROLL_EVERY_MS = 1200;
/** No new members for this long means the end of the list. */
const IDLE_FINISH_MS = 12_000;
/** A request older than this was abandoned; ignore it. */
const REQUEST_TTL_MS = 10 * 60 * 1000;

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

/**
 * Collects every member of a list from the list's members page. It scrolls
 * the page so that x.com loads the next page of members, and reads each page
 * from x.com's own API responses (see x-bridge.content.ts). When no new
 * members arrive for a while, it hands the members to the block queue.
 */
const runImport = (
  ctx: ContentScriptContext,
  session: XSession,
  listId: string
) => {
  const members = new Map<string, XUser>();
  let lastGrowthAt = Date.now();
  let reachedEnd = false;
  let finished = false;
  const panel = createPanel();

  const unsubscribe = session.onListMembers((page) => {
    if (page.listId !== listId) {
      return;
    }
    if (page.users.length === 0) {
      reachedEnd = true;
    }
    for (const user of page.users) {
      if (!members.has(user.id)) {
        members.set(user.id, user);
        lastGrowthAt = Date.now();
      }
    }
  });

  const stop = () => {
    finished = true;
    unsubscribe();
    clearInterval(timer);
  };

  const finish = async () => {
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
    panel.setText(finishMessage(summary.added, skipped));
    panel.setButtons([
      ...(summary.added > 0
        ? [
            {
              label: "Start blocking",
              primary: true,
              run: async () => {
                await send({
                  patch: { lastError: null, status: "running" },
                  type: "runner/update",
                });
                panel.setText("Blocking. Keep an x.com tab open.");
                panel.setButtons([
                  { label: "Close", run: () => panel.root.remove() },
                ]);
              },
            },
          ]
        : []),
      { label: "Close", run: () => panel.root.remove() },
    ]);
  };

  const tick = () => {
    if (finished) {
      return;
    }
    const idleFor = Date.now() - lastGrowthAt;
    panel.setProgress(` ${members.size}`);
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

  panel.setText("Collecting members…");
  panel.setButtons([
    { label: "Finish", primary: true, run: () => finish() },
    {
      label: "Cancel",
      run: async () => {
        stop();
        panel.root.remove();
        await send({ type: "import/cancel" });
      },
    },
  ]);
  const timer = ctx.setInterval(tick, SCROLL_EVERY_MS);
  tick();
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
  const request = await pendingImportItem.getValue();
  const listId = parseListId(match[1] ?? "");
  if (
    !(request && listId) ||
    request.listId !== listId ||
    Date.now() - request.requestedAt > REQUEST_TTL_MS
  ) {
    return;
  }
  markRunning();
  runImport(ctx, session, listId);
};
