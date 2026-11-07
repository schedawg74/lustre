import {
  type EntryStatus,
  type QueueEntry,
  summarize,
} from "@lustre/block-queue/queue";
import { useId, useMemo, useState } from "react";
import { send } from "@/lib/messages";
import { queueItem } from "@/lib/storage";
import { formatCount } from "./format";
import { Button, Hint, inputClass, linkClass } from "./ui";
import { useStorageItem } from "./use-storage-item";

const LIMIT = 100;

const FILTERS: { status: EntryStatus; label: string }[] = [
  { label: "Pending", status: "pending" },
  { label: "Blocked", status: "blocked" },
  { label: "Skipped", status: "skipped" },
  { label: "Failed", status: "failed" },
];

const REASONS: Record<string, string> = {
  allowlisted: "on your never-block list",
  "already-blocked": "already blocked",
  "skipped-by-you": "skipped by you",
  unavailable: "account gone",
  "you-follow": "you follow",
};

const RowAction = ({ entry }: { entry: QueueEntry }) => {
  if (entry.status === "pending") {
    return (
      <Button
        onClick={() => send({ type: "queue/skip", userId: entry.userId })}
        title={`Do not block @${entry.screenName}`}
        variant="quiet"
      >
        Skip
      </Button>
    );
  }
  if (entry.status === "failed") {
    return (
      <Button
        onClick={() => send({ type: "queue/retryFailed" })}
        title="Queue every failed account again"
        variant="quiet"
      >
        Retry all
      </Button>
    );
  }
  return null;
};

export const AccountsTab = ({
  initialFilter = "pending",
}: {
  initialFilter?: EntryStatus;
}) => {
  const queue = useStorageItem(queueItem);
  const summary = useMemo(() => summarize(queue), [queue]);
  const [filter, setFilter] = useState<EntryStatus>(initialFilter);
  const [search, setSearch] = useState("");
  const searchId = useId();

  const entries = useMemo(() => {
    const needle = search.trim().replace(/^@/, "").toLowerCase();
    return Object.values(queue)
      .filter(
        (entry) =>
          entry.status === filter &&
          (!needle ||
            entry.screenName.toLowerCase().includes(needle) ||
            entry.name.toLowerCase().includes(needle))
      )
      .sort((a, b) =>
        filter === "pending" ? a.addedAt - b.addedAt : b.updatedAt - a.updatedAt
      );
  }, [queue, filter, search]);

  const filters = FILTERS.filter(
    (item) => item.status !== "failed" || summary.failed > 0
  );

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <fieldset className="flex gap-1">
        <legend className="sr-only">Show accounts</legend>
        {filters.map((item) => (
          <button
            aria-pressed={filter === item.status}
            className={`flex flex-1 cursor-pointer flex-col items-center rounded-stone py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${filter === item.status ? "bg-surface text-text" : "text-muted hover:text-text"}`}
            data-testid={`count-${item.status}`}
            key={item.status}
            onClick={() => setFilter(item.status)}
            type="button"
          >
            <span className="font-display text-lg tabular-nums leading-tight">
              {formatCount(summary[item.status])}
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em]">
              {item.label}
            </span>
          </button>
        ))}
      </fieldset>
      <label className="sr-only" htmlFor={searchId}>
        Search accounts
      </label>
      <input
        className={inputClass}
        id={searchId}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name or @handle"
        type="search"
        value={search}
      />
      {entries.length === 0 ? (
        <Hint>No accounts here.</Hint>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {entries.slice(0, LIMIT).map((entry) => (
            <li
              className="flex items-center justify-between gap-2 rounded-stone px-2 py-1 hover:bg-surface"
              key={entry.userId}
            >
              <div className="min-w-0">
                <a
                  className={`block truncate text-sm hover:text-accent ${linkClass}`}
                  href={`https://x.com/${entry.screenName}`}
                  rel="noopener"
                  target="_blank"
                >
                  {entry.name}{" "}
                  <span className="text-muted">@{entry.screenName}</span>
                </a>
                {entry.reason && entry.status !== "pending" ? (
                  <Hint>{REASONS[entry.reason] ?? entry.reason}</Hint>
                ) : null}
              </div>
              <RowAction entry={entry} />
            </li>
          ))}
        </ul>
      )}
      {entries.length > LIMIT ? (
        <Hint>
          {LIMIT} of {formatCount(entries.length)} shown. Search to find others.
        </Hint>
      ) : null}
    </div>
  );
};
