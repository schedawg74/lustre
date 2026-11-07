import {
  XAuthError,
  XRateLimitError,
  XRequestError,
} from "@feedwarden/x-client/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { readSettings, type Settings, watchSettings } from "@/lib/storage";
import {
  findActionBar,
  hideTweet,
  ICONS,
  icon,
  readAuthorHandle,
  readOwnHandle,
  SELECTORS,
} from "./dom";
import { clickMenuEntry, MenuEntryMissingError } from "./menu";
import type { XSession } from "./session";
import { showToast } from "./toast";

const TOOLBAR_CLASS = "fw-actions";

type Action = "block" | "mute" | "notInterested";

const ACTIONS: {
  action: Action;
  label: string;
  setting: keyof Settings;
  icon: readonly string[];
}[] = [
  {
    action: "block",
    icon: ICONS.block,
    label: "Block",
    setting: "showBlockButton",
  },
  {
    action: "mute",
    icon: ICONS.mute,
    label: "Mute",
    setting: "showMuteButton",
  },
  {
    action: "notInterested",
    icon: ICONS.notInterested,
    label: "Not interested",
    setting: "showNotInterestedButton",
  },
];

const describeError = (error: unknown): string => {
  if (error instanceof XRateLimitError) {
    return "X rate limit reached. Try again in a few minutes.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * The API is quicker and works while the post is off screen. When it fails
 * for a reason other than the rate limit (for example x.com started to require
 * a new header), the same action is done through the post's "⋯" menu.
 */
const shouldUseMenuInstead = (error: unknown) =>
  error instanceof XAuthError ||
  (error instanceof XRequestError && !error.retryable);

export const mountInlineActions = async (
  ctx: ContentScriptContext,
  session: XSession
) => {
  let settings = await readSettings();
  const { client } = session;

  const runAction = async (
    action: Action,
    article: Element,
    handle: string
  ) => {
    // Hide the post only after the action worked: the menu fallback needs
    // the post on screen.
    const hide = () =>
      settings.hideAfterAction ? hideTweet(article) : undefined;
    try {
      if (action === "notInterested") {
        await clickMenuEntry(article, "notInterested");
        hide();
        showToast(`Marked as not interested: post by @${handle}`);
        return;
      }
      const api = action === "block" ? client.block : client.mute;
      try {
        await api({ screenName: handle });
      } catch (error) {
        if (!shouldUseMenuInstead(error)) {
          throw error;
        }
        await clickMenuEntry(article, action);
      }
      const showAgain = hide();
      const undo = action === "block" ? client.unblock : client.unmute;
      showToast(`${action === "block" ? "Blocked" : "Muted"} @${handle}`, {
        action: {
          label: "Undo",
          run: async () => {
            try {
              await undo({ screenName: handle });
              showAgain?.();
              showToast(
                `${action === "block" ? "Unblocked" : "Unmuted"} @${handle}`
              );
            } catch (error) {
              showToast(describeError(error), { tone: "error" });
            }
          },
        },
      });
    } catch (error) {
      const message =
        error instanceof MenuEntryMissingError && action === "notInterested"
          ? "X offers “Not interested” only on the For you timeline."
          : describeError(error);
      showToast(message, { tone: "error" });
    }
  };

  const buildToolbar = (article: Element, handle: string) => {
    const toolbar = document.createElement("div");
    toolbar.className = TOOLBAR_CLASS;
    for (const entry of ACTIONS) {
      if (!settings[entry.setting]) {
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = `fw-action fw-action-${entry.action}`;
      button.title = `${entry.label} @${handle}`;
      button.setAttribute("aria-label", `${entry.label} @${handle}`);
      button.append(icon(entry.icon));
      button.addEventListener("click", async (event) => {
        // The post itself is a link; keep the click on the button.
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        await runAction(entry.action, article, handle);
        button.disabled = false;
      });
      toolbar.append(button);
    }
    return toolbar;
  };

  const decorate = () => {
    const ownHandle = readOwnHandle()?.toLowerCase();
    for (const article of document.querySelectorAll(SELECTORS.tweet)) {
      if (article.querySelector(`.${TOOLBAR_CLASS}`)) {
        continue;
      }
      const handle = readAuthorHandle(article);
      const actionBar = findActionBar(article);
      if (!(handle && actionBar) || handle.toLowerCase() === ownHandle) {
        continue;
      }
      const toolbar = buildToolbar(article, handle);
      if (toolbar.childElementCount > 0) {
        actionBar.append(toolbar);
      }
    }
  };

  const redecorate = () => {
    for (const toolbar of document.querySelectorAll(`.${TOOLBAR_CLASS}`)) {
      toolbar.remove();
    }
    decorate();
  };

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorate();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  ctx.onInvalidated(() => observer.disconnect());

  const unwatch = watchSettings((next) => {
    settings = next;
    redecorate();
  });
  ctx.onInvalidated(unwatch);

  decorate();
};
