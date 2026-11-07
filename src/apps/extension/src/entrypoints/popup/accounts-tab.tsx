import { type EntryStatus, summarize } from "@lustre/block-queue/queue";
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

/** Filters in the order the owner looks at them when the tab opens. */
const AUTO_ORDER: EntryStatus[] = ["pending", "failed", "blocked", "skipped"];

/**
 * The filter to show: the one the owner picked if it still has a button,
 * otherwise the first filter with accounts.
 */
const resolveFilter = (
  picked: EntryStatus | undefined,
  summary: Record<EntryStatus, number>
): EntryStatus => {
  if (picked && (picked !== "failed" || summary.failed > 0)) {
    return picked;
  }
  return AUTO_ORDER.find((status) => summary[status] > 0) ?? "pending";
};

export const AccountsTab = ({
  filter: picked,
  onFilterChange,
}: {
  /** Undefined: open on the first filter with accounts. */
  filter?: EntryStatus;
  onFilterChange: (filter: EntryStatus) => void;
}) => {
  const queue = useStorageItem(queueItem);
  const summary = useMemo(() => summarize(queue), [queue]);
  const filter = resolveFilter(picked, summary);
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
            className={`relative flex flex-1 cursor-pointer flex-col items-center py-1.5 transition-colors after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${filter === item.status ? "text-text after:bg-accent" : "text-muted hover:text-text"}`}
            data-testid={`count-${item.status}`}
            key={item.status}
            onClick={() => onFilterChange(item.status)}
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
      {filter === "failed" && summary.failed > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <Hint>X refused these blocks. Retrying queues them again.</Hint>
          <Button onClick={() => send({ type: "queue/retryFailed" })}>
            Retry all
          </Button>
        </div>
      ) : null}
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
                {entry.reason &&
                entry.status !== "pending" &&
                entry.status !== "blocked" ? (
                  <Hint>{REASONS[entry.reason] ?? entry.reason}</Hint>
                ) : null}
              </div>
              {entry.status === "pending" ? (
                <Button
                  onClick={() =>
                    send({ type: "queue/skip", userId: entry.userId })
                  }
                  title={`Do not block @${entry.screenName}`}
                  variant="quiet"
                >
                  Skip
                </Button>
              ) : null}
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
