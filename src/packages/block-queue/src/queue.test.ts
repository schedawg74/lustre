import type { XUser } from "@lustre/x-client/users";
import { describe, expect, it } from "vitest";
import {
  addCandidates,
  type BlockQueue,
  jitteredDelay,
  MAX_ATTEMPTS,
  migrateQueueV1,
  nextPending,
  recordOutcome,
  removeSource,
  retryFailed,
  skipEntry,
  summarize,
} from "./queue";

const user = (id: string, extra: Partial<XUser> = {}): XUser => ({
  blocking: false,
  following: false,
  id,
  name: `User ${id}`,
  screenName: `user${id}`,
  ...extra,
});

const options = {
  allowlist: [] as string[],
  now: 100,
  skipFollowing: true,
  source: "list:1",
};

const queueOf = (...users: XUser[]): BlockQueue =>
  addCandidates({}, users, options).queue;

describe("addCandidates", () => {
  it("queues new accounts and skips protected ones", () => {
    const result = addCandidates(
      {},
      [
        user("1"),
        user("2", { following: true }),
        user("3", { blocking: true }),
        user("4", { screenName: "Friend" }),
      ],
      { ...options, allowlist: ["@friend"] }
    );
    expect(result.added).toBe(1);
    expect(result.skipped).toEqual({
      allowlisted: 1,
      "already-blocked": 1,
      "you-follow": 1,
    });
    expect(result.queue["1"]?.status).toBe("pending");
    expect(result.queue["2"]).toMatchObject({
      reason: "you-follow",
      status: "skipped",
    });
  });

  it("queues followed accounts when skipFollowing is off", () => {
    const result = addCandidates({}, [user("2", { following: true })], {
      ...options,
      skipFollowing: false,
    });
    expect(result.queue["2"]?.status).toBe("pending");
  });

  it("keeps existing entries on a second import", () => {
    const first = queueOf(user("1"));
    const blocked = recordOutcome(first, "1", { kind: "blocked" }, 200);
    const second = addCandidates(blocked, [user("1"), user("5")], options);
    expect(second.duplicates).toBe(1);
    expect(second.added).toBe(1);
    expect(second.queue["1"]?.status).toBe("blocked");
  });
});

describe("nextPending", () => {
  it("returns the oldest pending entry", () => {
    const early = addCandidates({}, [user("9")], { ...options, now: 1 }).queue;
    const { queue } = addCandidates(early, [user("1")], options);
    expect(nextPending(queue)?.userId).toBe("9");
    expect(nextPending({})).toBeUndefined();
  });
});

describe("recordOutcome", () => {
  it("retries retryable failures up to the limit", () => {
    let queue = queueOf(user("1"));
    const failure = {
      kind: "failed",
      reason: "HTTP 503",
      retryable: true,
    } as const;
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      queue = recordOutcome(queue, "1", failure, 200);
      expect(queue["1"]?.status).toBe("pending");
    }
    queue = recordOutcome(queue, "1", failure, 300);
    expect(queue["1"]).toMatchObject({
      attempts: MAX_ATTEMPTS,
      status: "failed",
    });
  });

  it("fails at once when the error is not retryable", () => {
    const queue = recordOutcome(
      queueOf(user("1")),
      "1",
      { kind: "failed", reason: "HTTP 400", retryable: false },
      200
    );
    expect(queue["1"]?.status).toBe("failed");
  });

  it("clears the reason once blocked", () => {
    let queue = queueOf(user("1"));
    queue = recordOutcome(
      queue,
      "1",
      { kind: "failed", reason: "HTTP 503", retryable: true },
      200
    );
    queue = recordOutcome(queue, "1", { kind: "blocked" }, 300);
    expect(queue["1"]?.status).toBe("blocked");
    expect(queue["1"]?.reason).toBeUndefined();
  });

  it("ignores unknown ids", () => {
    const queue = queueOf(user("1"));
    expect(recordOutcome(queue, "nope", { kind: "blocked" }, 1)).toBe(queue);
  });
});

describe("skipEntry and retryFailed", () => {
  it("skips pending entries and requeues failed ones", () => {
    let queue = queueOf(user("1"), user("2"));
    queue = skipEntry(queue, "1", 200);
    queue = recordOutcome(
      queue,
      "2",
      { kind: "failed", reason: "x", retryable: false },
      200
    );
    expect(summarize(queue)).toMatchObject({ failed: 1, skipped: 1 });
    queue = retryFailed(queue, 300);
    expect(queue["2"]).toMatchObject({ attempts: 0, status: "pending" });
    expect(summarize(queue)).toEqual({
      blocked: 0,
      failed: 0,
      pending: 1,
      skipped: 1,
      total: 2,
    });
  });
});

describe("jitteredDelay", () => {
  it("stays within half to one and a half times the base", () => {
    expect(jitteredDelay(2000, () => 0)).toBe(1000);
    expect(jitteredDelay(2000, () => 0.999_999)).toBe(3000);
  });
});

describe("several lists", () => {
  it("adds the second list as a source without changing the status", () => {
    const first = recordOutcome(
      queueOf(user("1")),
      "1",
      { kind: "blocked" },
      2
    );
    const second = addCandidates(first, [user("1")], {
      ...options,
      source: "list:2",
    });
    expect(second.queue["1"]).toMatchObject({
      sources: ["list:1", "list:2"],
      status: "blocked",
    });
    expect(second.duplicates).toBe(1);
  });

  it("drops pending accounts of a removed list and keeps history", () => {
    let queue = queueOf(user("1"), user("2"), user("3"));
    ({ queue } = addCandidates(queue, [user("3")], {
      ...options,
      source: "list:2",
    }));
    queue = recordOutcome(queue, "2", { kind: "blocked" }, 2);
    const result = removeSource(queue, "list:1");
    expect(result.dropped).toBe(1);
    expect(result.queue["1"]).toBeUndefined();
    expect(result.queue["2"]).toMatchObject({ sources: [], status: "blocked" });
    expect(result.queue["3"]).toMatchObject({ sources: ["list:2"] });
  });

  it("migrates entries stored with a single source", () => {
    const legacy = {
      "1": {
        addedAt: 1,
        attempts: 0,
        name: "A",
        screenName: "a",
        source: "list:1",
        status: "pending" as const,
        updatedAt: 1,
        userId: "1",
      },
    };
    expect(migrateQueueV1(legacy)["1"]).toMatchObject({
      sources: ["list:1"],
    });
  });
});

describe("removal while a block is in flight", () => {
  it("records the block from the runner's copy", () => {
    const queue = queueOf(user("1"));
    const attempted = queue["1"];
    const { queue: removed } = removeSource(queue, "list:1");
    expect(removed["1"]).toBeUndefined();
    const after = recordOutcome(
      removed,
      "1",
      { kind: "blocked" },
      5,
      attempted
    );
    expect(after["1"]).toMatchObject({ sources: [], status: "blocked" });
  });

  it("drops other outcomes of a removed entry", () => {
    const queue = queueOf(user("1"));
    const attempted = queue["1"];
    const { queue: removed } = removeSource(queue, "list:1");
    const failure = { kind: "failed", reason: "x", retryable: true } as const;
    expect(recordOutcome(removed, "1", failure, 5, attempted)).toBe(removed);
  });
});
