import { normalizeHandle, summarize } from "@feedwarden/block-queue/queue";
import { parseListId } from "@feedwarden/x-client/users";
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
import { useNow, useStorageItem } from "./use-storage-item";

const HEARTBEAT_STALE_MS = 15_000;
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

const Toggle = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="toggle">
    <span>
      {label}
      {hint ? <small>{hint}</small> : null}
    </span>
    <input
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      type="checkbox"
    />
  </label>
);

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
    <section>
      <header className="section-header">
        <h2>Block queue</h2>
        <span className={`pill pill-${runner.status}`}>{status}</span>
      </header>
      <dl className="stats">
        <div>
          <dt>Pending</dt>
          <dd>{summary.pending}</dd>
        </div>
        <div>
          <dt>Blocked</dt>
          <dd>{summary.blocked}</dd>
        </div>
        <div>
          <dt>Skipped</dt>
          <dd>{summary.skipped}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{summary.failed}</dd>
        </div>
      </dl>
      {runner.lastError ? (
        <p className="notice notice-error">{runner.lastError}</p>
      ) : null}
      {runner.status === "running" && !tabConnected ? (
        <p className="notice">
          Blocking runs inside an x.com tab. Open{" "}
          <a href="https://x.com/home" rel="noopener" target="_blank">
            x.com
          </a>{" "}
          and keep it open.
        </p>
      ) : null}
      <div className="row">
        {runner.status === "running" ? (
          <button onClick={() => setStatus("paused")} type="button">
            Pause
          </button>
        ) : (
          <button
            className="primary"
            disabled={summary.pending === 0}
            onClick={() => setStatus("running")}
            type="button"
          >
            Start blocking
          </button>
        )}
        {summary.failed > 0 ? (
          <button
            onClick={() => send({ type: "queue/retryFailed" })}
            type="button"
          >
            Retry failed
          </button>
        ) : null}
      </div>
      {summary.pending > 0 ? <ReviewList /> : null}
    </section>
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
    <details className="review">
      <summary>Review pending accounts</summary>
      <label className="sr-only" htmlFor={filterId}>
        Filter pending accounts
      </label>
      <input
        id={filterId}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter by name or @handle"
        type="search"
        value={filter}
      />
      <ul>
        {pending.slice(0, REVIEW_LIMIT).map((entry) => (
          <li key={entry.userId}>
            <a
              href={`https://x.com/${entry.screenName}`}
              rel="noopener"
              target="_blank"
            >
              <strong>{entry.name}</strong> <span>@{entry.screenName}</span>
            </a>
            <button
              onClick={() => send({ type: "queue/skip", userId: entry.userId })}
              title={`Never block @${entry.screenName} from this queue`}
              type="button"
            >
              Skip
            </button>
          </li>
        ))}
      </ul>
      {pending.length > REVIEW_LIMIT ? (
        <p className="muted">
          Showing {REVIEW_LIMIT} of {pending.length}. Filter to find others.
        </p>
      ) : null}
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
    <section>
      <header className="section-header">
        <h2>Block lists</h2>
      </header>
      <p className="muted">
        Imports every member of an X list into the block queue. A tab opens on
        the list and scrolls through it; accounts you follow are skipped.
      </p>
      <form className="row" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor={inputId}>
          X list link
        </label>
        <input
          id={inputId}
          onChange={(event) => setInput(event.target.value)}
          placeholder="https://x.com/i/lists/…"
          type="url"
          value={input}
        />
        <button className="primary" type="submit">
          Import
        </button>
      </form>
      {error ? <p className="notice notice-error">{error}</p> : null}
      {tracked.length > 0 ? (
        <ul className="lists">
          {tracked.map((list) => (
            <li key={list.listId}>
              <a href={list.url} rel="noopener" target="_blank">
                List {list.listId}
              </a>
              <span className="muted">
                {list.memberCount ?? 0} members ·{" "}
                {formatDate(list.lastImportedAt ?? 0)}
              </span>
              <button onClick={() => importList(list.listId)} type="button">
                Re-import
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

const ButtonsSection = () => {
  const [settings, update] = useSettings();
  return (
    <section>
      <header className="section-header">
        <h2>Buttons on posts</h2>
      </header>
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
    </section>
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
    <section>
      <header className="section-header">
        <h2>Safety</h2>
      </header>
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
      <label className="field" htmlFor={delayId}>
        <span>
          Seconds between blocks
          <small>Slower is less likely to hit X's limits</small>
        </span>
        <input
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
      <label className="field field-stacked" htmlFor={allowlistId}>
        <span>
          Never block these handles
          <small>One per line or separated by commas</small>
        </span>
        <textarea
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
    </section>
  );
};

export const App = () => (
  <main>
    <h1>Feedwarden</h1>
    <QueueSection />
    <ListsSection />
    <ButtonsSection />
    <SafetySection />
  </main>
);
