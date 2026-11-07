import {
  addCandidates,
  recordOutcome,
  removeSource,
  retryFailed,
  skipEntry,
  summarize,
} from "@lustre/block-queue/queue";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import type { ImportSummary, Message } from "@/lib/messages";
import {
  endImport,
  isImporting,
  startImport,
  updateImport,
} from "@/lib/pending-imports";
import {
  listsItem,
  pendingImportsItem,
  queueItem,
  readSettings,
  runnerItem,
} from "@/lib/storage";

const membersUrl = (listId: string) =>
  `https://x.com/i/lists/${listId}/members`;

const handlers = {
  "import/cancel": async ({ listId }) => {
    await pendingImportsItem.setValue(
      endImport(await pendingImportsItem.getValue(), listId)
    );
  },

  "import/finish": async ({ listId, list, users }): Promise<ImportSummary> => {
    // The list was removed (or the import cancelled) while it collected.
    if (!isImporting(await pendingImportsItem.getValue(), listId, Date.now())) {
      return {
        added: 0,
        cancelled: true,
        duplicates: 0,
        skipped: { allowlisted: 0, "already-blocked": 0, "you-follow": 0 },
      };
    }
    const settings = await readSettings();
    const { queue, ...summary } = addCandidates(
      await queueItem.getValue(),
      users,
      {
        allowlist: settings.allowlist,
        now: Date.now(),
        skipFollowing: settings.skipFollowing,
        source: `list:${listId}`,
      }
    );
    await queueItem.setValue(queue);
    const lists = await listsItem.getValue();
    await listsItem.setValue({
      ...lists,
      [listId]: {
        lastImportedAt: Date.now(),
        listId,
        memberCount: users.length,
        name: list?.name ?? lists[listId]?.name,
        ownerScreenName:
          list?.ownerScreenName ?? lists[listId]?.ownerScreenName,
        url: `https://x.com/i/lists/${listId}`,
      },
    });
    const imports = await pendingImportsItem.getValue();
    await pendingImportsItem.setValue(endImport(imports, listId));
    // The import tab was opened in the background for this; close it.
    const tabId = imports[listId]?.tabId;
    if (tabId !== undefined) {
      await browser.tabs.remove(tabId).catch(() => undefined);
    }
    if (settings.autoStartAfterImport && summary.added > 0) {
      const runner = await runnerItem.getValue();
      await runnerItem.setValue({ ...runner, status: "running" });
    }
    return summary;
  },

  "import/progress": async ({ listId, found }) => {
    await pendingImportsItem.setValue(
      updateImport(await pendingImportsItem.getValue(), listId, {
        found,
        requestedAt: Date.now(),
      })
    );
  },

  "import/show": async ({ listId }) => {
    const tabId = (await pendingImportsItem.getValue())[listId]?.tabId;
    if (tabId === undefined) {
      return;
    }
    const tab = await browser.tabs.update(tabId, { active: true });
    if (tab?.windowId !== undefined) {
      await browser.windows.update(tab.windowId, { focused: true });
    }
  },
  "import/start": async ({ listId }) => {
    await pendingImportsItem.setValue(
      startImport(await pendingImportsItem.getValue(), listId, Date.now())
    );
    const lists = await listsItem.getValue();
    await listsItem.setValue({
      ...lists,
      [listId]: {
        ...lists[listId],
        listId,
        url: `https://x.com/i/lists/${listId}`,
      },
    });
    // In the background, so the owner keeps browsing. The import pages
    // through the list with fetch, which works in a background tab.
    const tab = await browser.tabs.create({
      active: false,
      url: membersUrl(listId),
    });
    await pendingImportsItem.setValue(
      updateImport(await pendingImportsItem.getValue(), listId, {
        tabId: tab.id,
      })
    );
  },

  "lists/remove": async ({ listId }) => {
    // A running import of this list must not bring it back when it ends.
    await pendingImportsItem.setValue(
      endImport(await pendingImportsItem.getValue(), listId)
    );
    const { [listId]: _removed, ...lists } = await listsItem.getValue();
    await listsItem.setValue(lists);
    const { queue } = removeSource(
      await queueItem.getValue(),
      `list:${listId}`
    );
    await queueItem.setValue(queue);
  },

  "queue/outcome": async ({ userId, outcome, attempted }) => {
    await queueItem.setValue(
      recordOutcome(
        await queueItem.getValue(),
        userId,
        outcome,
        Date.now(),
        attempted
      )
    );
  },

  "queue/retryFailed": async () => {
    await queueItem.setValue(
      retryFailed(await queueItem.getValue(), Date.now())
    );
  },

  "queue/skip": async ({ userId }) => {
    await queueItem.setValue(
      skipEntry(await queueItem.getValue(), userId, Date.now())
    );
  },

  "runner/update": async ({ patch }) => {
    const runner = await runnerItem.getValue();
    await runnerItem.setValue({ ...runner, ...patch });
  },
} satisfies {
  [T in Message["type"]]: (
    message: Extract<Message, { type: T }>
  ) => Promise<unknown>;
};

const isMessage = (value: unknown): value is Message =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof value.type === "string" &&
  value.type in handlers;

const badgeText = (pending: number) => {
  if (pending === 0) {
    return "";
  }
  return pending < 1000 ? String(pending) : `${Math.floor(pending / 1000)}k`;
};

/** Shows how many accounts are still waiting to be blocked. */
const updateBadge = async () => {
  const { pending } = summarize(await queueItem.getValue());
  const runner = await runnerItem.getValue();
  await browser.action.setBadgeText({
    text: badgeText(pending),
  });
  await browser.action.setBadgeBackgroundColor({
    color: runner.status === "running" ? "#1d9bf0" : "#71767b",
  });
};

export default defineBackground(() => {
  // One write at a time: each handler reads, changes and saves a whole item.
  let writes: Promise<unknown> = Promise.resolve();

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isMessage(message)) {
      return;
    }
    const run = () =>
      (handlers[message.type] as (m: Message) => Promise<unknown>)(message);
    const result = writes.then(run, run);
    writes = result.catch(() => undefined);
    return result;
  });

  queueItem.watch(updateBadge);
  runnerItem.watch(updateBadge);
  updateBadge();
});
