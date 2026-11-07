import { normalizeHandle, summarize } from "@lustre/block-queue/queue";
import { parseListId } from "@lustre/x-client/users";
import { type FormEvent, useId, useMemo, useState } from "react";
import { send } from "@/lib/messages";
import {
  DEFAULT_LIST_URL,
  DEFAULT_SETTINGS,
  listsItem,
  queueItem,
  runnerHeartbeatItem,
  runnerItem,
  type Settings,
  settingsItem,
} from "@/lib/storage";
import {
  Button,
  Chip,
  fieldClass,
  inputClass,
  linkClass,
  Notice,
  Section,
  Stat,
  Toggle,
} from "./ui";
import { useNow, useStorageItem } from "./use-storage-item";

const HEARTBEAT_STALE_MS = 15_000;
const REVIEW_LIMIT = 100;
/** The review list gets a filter field above this many accounts. */
const FILTER_FROM = 10;

const STATUS_TONE = {
  idle: "text-muted",
  paused: "text-warn",
  running: "text-accent",
} as const;

const formatTime = (epochMs: number) =>
  new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const RELATIVE_STEPS = [
  { ms: 86_400_000, unit: "day" },
  { ms: 3_600_000, unit: "hour" },
  { ms: 60_000, unit: "minute" },
] as const;

const formatAgo = (epochMs: number, now: number) => {
  const elapsed = now - epochMs;
  const format = new Intl.RelativeTimeFormat([], { numeric: "auto" });
  for (const step of RELATIVE_STEPS) {
    if (elapsed >= step.ms) {
      return format.format(-Math.floor(elapsed / step.ms), step.unit);
    }
  }
  return "just now";
};

/** "2116659176894071283" becomes "2116…1283". */
const shortId = (id: string) =>
  id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;

const useSettings = () => {
  const stored = useStorageItem(settingsItem);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...stored };
  const update = (patch: Partial<Settings>) =>
    settingsItem.setValue({ ...settings, ...patch });
  return [settings, update] as const;
};

const QueueSection = () => {
  const queue = useStorageItem(queueItem);
  const runner = useStorageItem(runnerItem);
  const heartbeat = useStorageItem(runnerHeartbeatItem);
  const now = useNow(2000);
  const summary = useMemo(() => summarize(queue), [queue]);
  const [reviewing, setReviewing] = useState(false);
  const tabConnected = now - heartbeat < HEARTBEAT_STALE_MS;
  const rateLimitedUntil = runner.rateLimitedUntil ?? 0;

  let status = "Idle";
  if (runner.status === "running") {
    status =
      rateLimitedUntil > now
        ? `Paused by X until ${formatTime(rateLimitedUntil)}`
        : "Blocking";
  } else if (runner.status === "paused") {
    status = "Paused";
  }

  const setStatus = (next: "running" | "paused") =>
    send({ patch: { lastError: null, status: next }, type: "runner/update" });

  return (
    <Section
      aside={
        <span
          className={`inscription text-[11px] ${STATUS_TONE[runner.status]}`}
        >
          {status}
        </span>
      }
      numeral="I"
      title="Queue"
    >
      <dl
        className="grid auto-cols-fr grid-flow-col py-1"
        data-testid="queue-stats"
      >
        <Stat label="Pending" tone="text-text" value={summary.pending} />
        <Stat label="Blocked" tone="text-success" value={summary.blocked} />
        <Stat label="Skipped" tone="text-muted" value={summary.skipped} />
        {summary.failed > 0 ? (
          <Stat label="Failed" tone="text-danger" value={summary.failed} />
        ) : null}
      </dl>
      {runner.lastError ? (
        <Notice tone="danger">{runner.lastError}</Notice>
      ) : null}
      {runner.status === "running" && !tabConnected ? (
        <Notice>
          Open{" "}
          <a
            className={`text-accent underline ${linkClass}`}
            href="https://x.com/home"
            rel="noopener"
            target="_blank"
          >
            x.com
          </a>{" "}
          to continue. Blocking runs in an x.com tab.
        </Notice>
      ) : null}
      <div className="flex items-center gap-2">
        {runner.status === "running" ? (
          <Button onClick={() => setStatus("paused")}>Pause</Button>
        ) : (
          <Button
            disabled={summary.pending === 0}
            onClick={() => setStatus("running")}
            variant="primary"
          >
            Start blocking
          </Button>
        )}
        {summary.failed > 0 ? (
          <Button onClick={() => send({ type: "queue/retryFailed" })}>
            Retry failed
          </Button>
        ) : null}
        {summary.pending > 0 ? (
          <Button
            aria-expanded={reviewing}
            className="ml-auto"
            onClick={() => setReviewing(!reviewing)}
            variant="quiet"
          >
            {reviewing ? "Close" : "Review"}
          </Button>
        ) : null}
      </div>
      {reviewing && summary.pending > 0 ? <ReviewList /> : null}
    </Section>
  );
};

const ReviewList = () => {
  const queue = useStorageItem(queueItem);
  const [filter, setFilter] = useState("");
  const filterId = useId();
  const pending = useMemo(
    () =>
      Object.values(queue)
        .filter((entry) => entry.status === "pending")
        .sort((a, b) => a.addedAt - b.addedAt),
    [queue]
  );
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? pending.filter(
        (entry) =>
          entry.screenName.toLowerCase().includes(needle) ||
          entry.name.toLowerCase().includes(needle)
      )
    : pending;

  return (
    <div className="flex flex-col gap-2">
      {pending.length > FILTER_FROM ? (
        <>
          <label className="sr-only" htmlFor={filterId}>
            Filter accounts
          </label>
          <input
            className={inputClass}
            id={filterId}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter"
            type="search"
            value={filter}
          />
        </>
      ) : null}
      <ul className="-mx-2 max-h-56 overflow-y-auto">
        {shown.slice(0, REVIEW_LIMIT).map((entry) => (
          <li
            className="group flex items-center justify-between gap-2 rounded-stone px-2 py-1 text-sm hover:bg-surface"
            key={entry.userId}
          >
            <a
              className={`truncate text-text hover:text-accent ${linkClass}`}
              href={`https://x.com/${entry.screenName}`}
              rel="noopener"
              target="_blank"
            >
              {entry.name}{" "}
              <span className="text-muted">@{entry.screenName}</span>
            </a>
            <Button
              className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              onClick={() => send({ type: "queue/skip", userId: entry.userId })}
              title={`Do not block @${entry.screenName}`}
              variant="quiet"
            >
              Skip
            </Button>
          </li>
        ))}
      </ul>
      {shown.length > REVIEW_LIMIT ? (
        <Notice>
          {REVIEW_LIMIT} of {shown.length} shown. Filter to find others.
        </Notice>
      ) : null}
    </div>
  );
};

const ListsSection = () => {
  const lists = useStorageItem(listsItem);
  const now = useNow(60_000);
  const tracked = Object.values(lists).filter((list) => list.lastImportedAt);
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
    <Section numeral="II" title="Lists">
      <form className="flex gap-2" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor={inputId}>
          X list link
        </label>
        <input
          className={inputClass}
          id={inputId}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste an X list link"
          type="url"
          value={value}
        />
        <Button type="submit" variant="primary">
          Import
        </Button>
      </form>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {tracked.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {tracked.map((list) => (
            <li
              className="flex items-center justify-between gap-3 rounded-stone px-2 py-1 text-sm hover:bg-surface"
              key={list.listId}
            >
              <a
                className={`truncate hover:text-accent ${linkClass}`}
                href={list.url}
                rel="noopener"
                target="_blank"
              >
                List {shortId(list.listId)}
                <span className="text-muted">
                  {" "}
                  · {list.memberCount ?? 0} members ·{" "}
                  {formatAgo(list.lastImportedAt ?? now, now)}
                </span>
              </a>
              <Button
                onClick={() => importList(list.listId)}
                title="Import again to queue new members"
                variant="quiet"
              >
                Update
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
};

const ButtonsSection = () => {
  const [settings, update] = useSettings();
  return (
    <Section numeral="III" title="Post buttons">
      <div className="flex flex-wrap gap-2">
        <Chip
          checked={settings.showBlockButton}
          label="Block"
          onChange={(showBlockButton) => update({ showBlockButton })}
        />
        <Chip
          checked={settings.showMuteButton}
          label="Mute"
          onChange={(showMuteButton) => update({ showMuteButton })}
        />
        <Chip
          checked={settings.showNotInterestedButton}
          label="Not interested"
          onChange={(showNotInterestedButton) =>
            update({ showNotInterestedButton })
          }
        />
      </div>
      <Toggle
        checked={settings.hideAfterAction}
        label="Hide the post after an action"
        onChange={(hideAfterAction) => update({ hideAfterAction })}
      />
    </Section>
  );
};

const SafetySection = () => {
  const [settings, update] = useSettings();
  const [allowlist, setAllowlist] = useState<string>();
  const allowlistId = useId();
  const delayId = useId();

  const saveAllowlist = () => {
    if (allowlist === undefined) {
      return;
    }
    const handles = allowlist
      .split(/[\s,]+/)
      .map(normalizeHandle)
      .filter(Boolean);
    update({ allowlist: [...new Set(handles)] });
    setAllowlist(undefined);
  };

  return (
    <Section numeral="IV" title="Safety">
      <Toggle
        checked={settings.skipFollowing}
        label="Skip accounts I follow"
        onChange={(skipFollowing) => update({ skipFollowing })}
      />
      <Toggle
        checked={settings.autoStartAfterImport}
        label="Start blocking after an import"
        onChange={(autoStartAfterImport) => update({ autoStartAfterImport })}
      />
      <label
        className="flex items-center justify-between gap-4 text-sm"
        htmlFor={delayId}
      >
        Seconds between blocks
        <input
          className={`${fieldClass} w-16 py-1 text-right tabular-nums`}
          id={delayId}
          max={30}
          min={1}
          onChange={(event) =>
            update({
              blockDelayMs: Math.max(1, Number(event.target.value)) * 1000,
            })
          }
          step={0.5}
          type="number"
          value={settings.blockDelayMs / 1000}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm" htmlFor={allowlistId}>
        Never block
        <textarea
          className={`${inputClass} resize-y`}
          id={allowlistId}
          onBlur={saveAllowlist}
          onChange={(event) => setAllowlist(event.target.value)}
          placeholder="@handle, @handle"
          rows={2}
          value={
            allowlist ??
            settings.allowlist.map((handle) => `@${handle}`).join(", ")
          }
        />
      </label>
    </Section>
  );
};

export const App = () => (
  <main className="w-[380px] bg-canvas pb-3 font-sans text-text antialiased">
    <header className="flex flex-col items-center px-5 pt-5 pb-2">
      <h1 className="inscription pl-[0.3em] font-semibold text-2xl tracking-[0.3em]">
        Lustre
      </h1>
      <div aria-hidden="true" className="meander mt-3 w-full text-accent/50" />
    </header>
    <QueueSection />
    <ListsSection />
    <ButtonsSection />
    <SafetySection />
  </main>
);
