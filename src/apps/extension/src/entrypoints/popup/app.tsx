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
  fieldClass,
  Hint,
  inputClass,
  Notice,
  Section,
  Stat,
  Toggle,
} from "./ui";
import { useNow, useStorageItem } from "./use-storage-item";

const HEARTBEAT_STALE_MS = 15_000;

const STATUS_TONE = {
  idle: "text-muted",
  paused: "text-warn",
  running: "text-accent",
} as const;
const REVIEW_LIMIT = 100;

const formatTime = (epochMs: number) =>
  new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatDate = (epochMs: number) =>
  new Date(epochMs).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
  const tabConnected = now - heartbeat < HEARTBEAT_STALE_MS;
  const rateLimited = (runner.rateLimitedUntil ?? 0) > now;

  let status = "Idle";
  if (runner.status === "running") {
    status = rateLimited
      ? `Rate limited until ${formatTime(runner.rateLimitedUntil ?? now)}`
      : "Blocking";
  } else if (runner.status === "paused") {
    status = "Paused";
  }

  const setStatus = (next: "running" | "paused") =>
    send({
      patch: { lastError: null, status: next },
      type: "runner/update",
    });

  return (
    <Section
      aside={
        <span
          className={`inscription text-[10px] ${STATUS_TONE[runner.status]}`}
        >
          {status}
        </span>
      }
      numeral="I"
      title="Block queue"
    >
      <dl className="grid grid-cols-4 gap-2" data-testid="queue-stats">
        <Stat label="Pending" tone="text-text" value={summary.pending} />
        <Stat label="Blocked" tone="text-success" value={summary.blocked} />
        <Stat label="Skipped" tone="text-muted" value={summary.skipped} />
        <Stat label="Failed" tone="text-danger" value={summary.failed} />
      </dl>
      {runner.lastError ? (
        <Notice tone="danger">{runner.lastError}</Notice>
      ) : null}
      {runner.status === "running" && !tabConnected ? (
        <Notice>
          Blocking runs inside an x.com tab. Open{" "}
          <a
            className="text-accent underline"
            href="https://x.com/home"
            rel="noopener"
            target="_blank"
          >
            x.com
          </a>{" "}
          and keep it open.
        </Notice>
      ) : null}
      <div className="flex gap-2">
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
      </div>
      {summary.pending > 0 ? <ReviewList /> : null}
    </Section>
  );
};

const ReviewList = () => {
  const queue = useStorageItem(queueItem);
  const [filter, setFilter] = useState("");
  const filterId = useId();
  const pending = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return Object.values(queue)
      .filter(
        (entry) =>
          entry.status === "pending" &&
          (!needle ||
            entry.screenName.toLowerCase().includes(needle) ||
            entry.name.toLowerCase().includes(needle))
      )
      .sort((a, b) => a.addedAt - b.addedAt);
  }, [queue, filter]);

  return (
    <details className="group text-sm">
      <summary className="cursor-pointer text-accent text-xs uppercase tracking-[0.14em] marker:text-accent">
        Review pending accounts
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <label className="sr-only" htmlFor={filterId}>
          Filter pending accounts
        </label>
        <input
          className={inputClass}
          id={filterId}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name or @handle"
          type="search"
          value={filter}
        />
        <ul className="max-h-56 overflow-y-auto">
          {pending.slice(0, REVIEW_LIMIT).map((entry) => (
            <li
              className="flex items-center justify-between gap-2 border-line border-b py-1.5"
              key={entry.userId}
            >
              <a
                className="truncate text-text hover:text-accent"
                href={`https://x.com/${entry.screenName}`}
                rel="noopener"
                target="_blank"
              >
                <span className="font-medium">{entry.name}</span>{" "}
                <span className="text-muted">@{entry.screenName}</span>
              </a>
              <Button
                onClick={() =>
                  send({ type: "queue/skip", userId: entry.userId })
                }
                size="sm"
                title={`Never block @${entry.screenName} from this queue`}
              >
                Skip
              </Button>
            </li>
          ))}
        </ul>
        {pending.length > REVIEW_LIMIT ? (
          <Hint>
            Showing {REVIEW_LIMIT} of {pending.length}. Filter to find others.
          </Hint>
        ) : null}
      </div>
    </details>
  );
};

const ListsSection = () => {
  const lists = useStorageItem(listsItem);
  const [input, setInput] = useState(DEFAULT_LIST_URL);
  const [error, setError] = useState<string>();
  const inputId = useId();

  const importList = async (listId: string) => {
    setError(undefined);
    await send({ listId, type: "import/start" });
    window.close();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const listId = parseListId(input);
    if (!listId) {
      setError("Paste a list link like https://x.com/i/lists/123…");
      return;
    }
    importList(listId);
  };

  const tracked = Object.values(lists).filter((list) => list.lastImportedAt);

  return (
    <Section numeral="II" title="Block lists">
      <Hint>
        Imports every member of an X list into the block queue. A tab opens on
        the list and scrolls through it; accounts you follow are skipped.
      </Hint>
      <form className="flex gap-2" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor={inputId}>
          X list link
        </label>
        <input
          className={inputClass}
          id={inputId}
          onChange={(event) => setInput(event.target.value)}
          placeholder="https://x.com/i/lists/…"
          type="url"
          value={input}
        />
        <Button type="submit" variant="primary">
          Import
        </Button>
      </form>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {tracked.length > 0 ? (
        <ul className="flex flex-col">
          {tracked.map((list) => (
            <li
              className="flex items-center justify-between gap-3 border-line border-b py-2 text-sm"
              key={list.listId}
            >
              <span className="min-w-0">
                <a
                  className="text-text hover:text-accent"
                  href={list.url}
                  rel="noopener"
                  target="_blank"
                >
                  List {list.listId}
                </a>
                <Hint>
                  {list.memberCount ?? 0} members ·{" "}
                  {formatDate(list.lastImportedAt ?? 0)}
                </Hint>
              </span>
              <Button onClick={() => importList(list.listId)} size="sm">
                Re-import
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
    <Section numeral="III" title="Buttons on posts">
      <Toggle
        checked={settings.showBlockButton}
        label="Block"
        onChange={(showBlockButton) => update({ showBlockButton })}
      />
      <Toggle
        checked={settings.showMuteButton}
        label="Mute"
        onChange={(showMuteButton) => update({ showMuteButton })}
      />
      <Toggle
        checked={settings.showNotInterestedButton}
        hint="X offers it on the For you timeline"
        label="Not interested"
        onChange={(showNotInterestedButton) =>
          update({ showNotInterestedButton })
        }
      />
      <Toggle
        checked={settings.hideAfterAction}
        label="Hide the post right away"
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
        label="Never block accounts I follow"
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
        <span>
          Seconds between blocks
          <Hint>Slower is less likely to hit X's limits</Hint>
        </span>
        <input
          className={`${fieldClass} w-20 text-right tabular-nums`}
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
        <span>
          Never block these handles
          <Hint>One per line or separated by commas</Hint>
        </span>
        <textarea
          className={`${inputClass} resize-y`}
          id={allowlistId}
          onBlur={saveAllowlist}
          onChange={(event) => setAllowlist(event.target.value)}
          placeholder="@friend"
          rows={3}
          value={
            allowlist ??
            settings.allowlist.map((handle) => `@${handle}`).join("\n")
          }
        />
      </label>
    </Section>
  );
};

export const App = () => (
  <main className="w-[380px] bg-canvas font-sans text-text antialiased">
    <header className="fluted flex flex-col items-center gap-1 px-5 pt-5 pb-3 text-text">
      <h1 className="inscription pl-[0.3em] font-semibold text-2xl tracking-[0.3em]">
        Lustre
      </h1>
      <p className="text-[10px] text-muted uppercase tracking-[0.28em]">
        Purify your feeds
      </p>
      <div aria-hidden="true" className="meander mt-2 w-full text-accent/60" />
    </header>
    <QueueSection />
    <ListsSection />
    <ButtonsSection />
    <SafetySection />
  </main>
);
