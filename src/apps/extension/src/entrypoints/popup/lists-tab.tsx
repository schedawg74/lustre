import type { BlockQueue, EntryStatus } from "@lustre/block-queue/queue";
import { parseListId } from "@lustre/x-client/users";
import { type FormEvent, useId, useMemo, useState } from "react";
import { send } from "@/lib/messages";
import {
  DEFAULT_LIST_URL,
  DEFAULT_SETTINGS,
  listsItem,
  queueItem,
  runnerItem,
  settingsItem,
} from "@/lib/storage";
import { formatAgo, formatCount, shortId } from "./format";
import { Button, Hint, inputClass, linkClass, Notice } from "./ui";
import { useNow, useStorageItem } from "./use-storage-item";

type ListProgress = Record<EntryStatus, number>;

const emptyProgress = (): ListProgress => ({
  blocked: 0,
  failed: 0,
  pending: 0,
  skipped: 0,
});

/** Accounts per status for each list, from the queue entries' source. */
const progressByList = (queue: BlockQueue) => {
  const progress = new Map<string, ListProgress>();
  for (const entry of Object.values(queue)) {
    if (!entry.source.startsWith("list:")) {
      continue;
    }
    const listId = entry.source.slice("list:".length);
    const current = progress.get(listId) ?? emptyProgress();
    current[entry.status] += 1;
    progress.set(listId, current);
  }
  return progress;
};

const PROGRESS_PARTS: [EntryStatus, string][] = [
  ["blocked", "blocked"],
  ["pending", "pending"],
  ["skipped", "skipped"],
  ["failed", "failed"],
];

/** "Done · 212 blocked, 9 skipped" or "212 blocked · 6 pending · 9 skipped". */
const describeProgress = (progress: ListProgress) => {
  const parts = PROGRESS_PARTS.filter(([status]) => progress[status] > 0).map(
    ([status, label]) => `${formatCount(progress[status])} ${label}`
  );
  if (parts.length === 0) {
    return "No members queued";
  }
  return progress.pending === 0 && progress.failed === 0
    ? `Done · ${parts.join(", ")}`
    : parts.join(" · ");
};

export const ListsTab = () => {
  const lists = useStorageItem(listsItem);
  const queue = useStorageItem(queueItem);
  const runner = useStorageItem(runnerItem);
  const settings = { ...DEFAULT_SETTINGS, ...useStorageItem(settingsItem) };
  const now = useNow(60_000);
  const blocksAtOnce =
    runner.status === "running" || settings.autoStartAfterImport;
  const tracked = Object.values(lists).filter((list) => list.lastImportedAt);
  const progress = useMemo(() => progressByList(queue), [queue]);
  // Suggest the starter list only until a list was imported.
  const [input, setInput] = useState<string>();
  const value = input ?? (tracked.length === 0 ? DEFAULT_LIST_URL : "");
  const [error, setError] = useState<string>();
  const inputId = useId();

  const importList = async (listId: string) => {
    setError(undefined);
    await send({ listId, type: "import/start" });
    window.close();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const listId = parseListId(value);
    if (!listId) {
      setError("That is not an X list link.");
      return;
    }
    importList(listId);
  };

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-2" onSubmit={onSubmit}>
        <label className="text-sm" htmlFor={inputId}>
          Block every member of an X list
        </label>
        <div className="flex gap-2">
          <input
            className={inputClass}
            id={inputId}
            onChange={(event) => setInput(event.target.value)}
            placeholder="https://x.com/i/lists/…"
            type="url"
            value={value}
          />
          <Button type="submit" variant="primary">
            Import
          </Button>
        </div>
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : (
          <Hint>
            {blocksAtOnce
              ? "New members are blocked right away."
              : "New members wait in Accounts until you press Start."}
            {settings.skipFollowing ? " Accounts you follow are skipped." : ""}
          </Hint>
        )}
      </form>
      {tracked.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {tracked.map((list) => {
            const listProgress = progress.get(list.listId) ?? emptyProgress();
            return (
              <li
                className="flex items-center justify-between gap-3 rounded-stone px-2 py-2 hover:bg-surface"
                key={list.listId}
              >
                <div className="min-w-0">
                  <a
                    className={`block truncate text-sm hover:text-accent ${linkClass}`}
                    href={list.url}
                    rel="noopener"
                    target="_blank"
                  >
                    {list.name ?? `List ${shortId(list.listId)}`}
                  </a>
                  <Hint>
                    {describeProgress(listProgress)} · updated{" "}
                    {formatAgo(list.lastImportedAt ?? now, now)}
                  </Hint>
                </div>
                <Button
                  onClick={() => importList(list.listId)}
                  title="Import again to queue new members"
                  variant="quiet"
                >
                  Update
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
