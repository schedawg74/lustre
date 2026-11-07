import type { Report } from "@lustre/api/v1";
import { installs, reports } from "@lustre/db";
import { createTestDatabase } from "@lustre/db/testing";
import { pino } from "pino";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { type AppOptions, createApp } from "./app";
import { createServices } from "./services";

const NOW = new Date("2026-11-07T12:00:00.000Z");

const openDatabases: (() => void)[] = [];
afterEach(() => {
  for (const close of openDatabases.splice(0)) {
    close();
  }
});

const setup = (limits?: AppOptions["limits"]) => {
  const { close, db } = createTestDatabase();
  openDatabases.push(close);
  let now = NOW;
  const app = createApp({
    limits: {
      installsPerIp: 100,
      perIp: 1000,
      perToken: 1000,
      statsPerIp: 1000,
      ...limits,
    },
    logger: pino({ level: "silent" }),
    services: createServices(db, () => now),
    trustProxyHops: 0,
  });
  const setNow = (value: Date) => {
    now = value;
  };
  const createInstall = async () => {
    const response = await request(app).post("/v1/installs").expect(201);
    return response.body as { installId: string; token: string };
  };
  const send = (token: string, batch: Report[]) =>
    request(app)
      .post("/v1/reports")
      .auth(token, { type: "bearer" })
      .send({ reports: batch })
      .expect(200);
  return { app, createInstall, db, send, setNow };
};

const LIST_ID = "2116659176894071283";

const report = (overrides: Partial<Report> = {}): Report => ({
  action: "block",
  list: { id: LIST_ID },
  name: "Slop Bot",
  reportedAt: "2026-11-07T11:00:00.000Z",
  screenName: "slop_bot",
  source: "list",
  userId: "1001",
  ...overrides,
});

const postReport = (overrides: Partial<Report> = {}): Report =>
  report({ list: undefined, source: "post", ...overrides });

describe("GET /health", () => {
  it("answers with security headers and no CORS for web origins", async () => {
    const { app } = setup();
    const response = await request(app)
      .get("/health")
      .set("origin", "https://evil.example")
      .expect(200, { status: "ok" });
    expect(response.headers["content-security-policy"]).toContain(
      "default-src 'none'"
    );
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows extension origins", async () => {
    const { app } = setup();
    for (const origin of [
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
      "moz-extension://6f1c1d3e-8f0a-4c1b-9a5e-2b7d4c3e1f00",
    ]) {
      const response = await request(app).get("/health").set("origin", origin);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
    }
  });
});

describe("POST /v1/installs", () => {
  it("returns a token and stores only its hash", async () => {
    const { createInstall, db } = setup();
    const { installId, token } = await createInstall();
    expect(token).toMatch(/^[\w-]{43}$/);
    const rows = db.select().from(installs).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(installId);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("limits new installs per IP address", async () => {
    const { app } = setup({ installsPerIp: 1 });
    await request(app).post("/v1/installs").expect(201);
    const response = await request(app).post("/v1/installs").expect(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("POST /v1/reports", () => {
  it("needs a valid token", async () => {
    const { app } = setup();
    const body = { reports: [report()] };
    await request(app).post("/v1/reports").send(body).expect(401);
    await request(app)
      .post("/v1/reports")
      .set("authorization", `Bearer ${"a".repeat(43)}`)
      .send(body)
      .expect(401);
  });

  it("rejects an invalid batch with the failed paths", async () => {
    const { app, createInstall } = setup();
    const { token } = await createInstall();
    const response = await request(app)
      .post("/v1/reports")
      .auth(token, { type: "bearer" })
      .send({ reports: [report({ userId: "not-a-number" })] })
      .expect(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
    expect(response.body.error.issues).toContainEqual(
      expect.objectContaining({ path: "reports.0.userId" })
    );
  });

  it("rejects invalid JSON and bodies above the limit", async () => {
    const { app, createInstall } = setup();
    const { token } = await createInstall();
    await request(app)
      .post("/v1/reports")
      .auth(token, { type: "bearer" })
      .set("content-type", "application/json")
      .send("{")
      .expect(400);
    const response = await request(app)
      .post("/v1/reports")
      .auth(token, { type: "bearer" })
      .send({ reports: [report({ name: "x".repeat(300_000) })] })
      .expect(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("records a batch once, so a retry changes nothing", async () => {
    const { app, createInstall } = setup();
    const { token } = await createInstall();
    const body = {
      reports: [
        report(),
        report({ action: "mute" }),
        report({ userId: "1002" }),
        report({ userId: "1002" }),
      ],
    };
    const send = () =>
      request(app)
        .post("/v1/reports")
        .auth(token, { type: "bearer" })
        .send(body)
        .expect(200);
    expect((await send()).body).toEqual({
      duplicates: 1,
      received: 4,
      recorded: 3,
    });
    expect((await send()).body).toEqual({
      duplicates: 4,
      received: 4,
      recorded: 0,
    });
  });

  it("limits requests per token", async () => {
    const { app, createInstall } = setup({ perToken: 1 });
    const { token } = await createInstall();
    const send = () =>
      request(app)
        .post("/v1/reports")
        .auth(token, { type: "bearer" })
        .send({ reports: [report()] });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
    const other = await createInstall();
    await request(app)
      .post("/v1/reports")
      .auth(other.token, { type: "bearer" })
      .send({ reports: [report()] })
      .expect(200);
  });
});

describe("list attribution", () => {
  const listOf = async (app: ReturnType<typeof setup>["app"], token: string) =>
    (
      await request(app)
        .get("/v1/lists")
        .auth(token, { type: "bearer" })
        .expect(200)
    ).body;

  it("keeps one report per install, account, and action with the newest list", async () => {
    const { createInstall, db, send } = setup();
    const { token } = await createInstall();
    await send(token, [
      report({ list: { id: "7", name: "Spam" }, userId: "1001" }),
    ]);
    const { body } = await send(token, [
      report({
        list: { id: "8" },
        reportedAt: "2026-11-07T11:30:00.000Z",
        userId: "1001",
      }),
      report({
        list: { id: "9" },
        reportedAt: "2026-11-07T10:00:00.000Z",
        userId: "1001",
      }),
    ]);
    expect(body).toEqual({ duplicates: 2, received: 2, recorded: 0 });
    const rows = db.select().from(reports).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ listId: "8", source: "list" });
    expect(rows[0]?.reportedAt.toISOString()).toBe("2026-11-07T11:30:00.000Z");
    await send(token, [
      postReport({ reportedAt: "2026-11-07T11:45:00.000Z", userId: "1001" }),
    ]);
    expect(db.select().from(reports).all()[0]).toMatchObject({
      listId: null,
      source: "post",
    });
  });

  it("keeps a list name and owner until a newer report has others", async () => {
    const { app, createInstall, send } = setup();
    const first = await createInstall();
    const second = await createInstall();
    await send(first.token, [
      report({
        list: { id: "7", name: "Spam", ownerScreenName: "owner" },
        userId: "1001",
      }),
    ]);
    await send(second.token, [
      report({
        list: { id: "7" },
        reportedAt: "2026-11-07T11:30:00.000Z",
        userId: "1002",
      }),
    ]);
    expect((await listOf(app, first.token)).lists).toEqual([
      {
        accounts: 2,
        firstReportedAt: "2026-11-07T11:00:00.000Z",
        id: "7",
        lastReportedAt: "2026-11-07T11:30:00.000Z",
        name: "Spam",
        ownerScreenName: "owner",
        reporters: 2,
      },
    ]);
    await send(second.token, [
      report({
        list: { id: "7", name: "Spam bots" },
        reportedAt: "2026-11-07T11:40:00.000Z",
        userId: "1003",
      }),
      report({
        list: { id: "7", name: "Old name", ownerScreenName: "old_owner" },
        reportedAt: "2026-11-01T00:00:00.000Z",
        userId: "1004",
      }),
    ]);
    expect((await listOf(app, first.token)).lists[0]).toMatchObject({
      accounts: 4,
      firstReportedAt: "2026-11-01T00:00:00.000Z",
      name: "Spam bots",
      ownerScreenName: "owner",
    });
  });

  it("filters the blocklist by list and caps the list ids", async () => {
    const { app, createInstall, send } = setup();
    const installTokens: string[] = [];
    for (let index = 0; index < 13; index += 1) {
      installTokens.push((await createInstall()).token);
    }
    for (const [index, token] of installTokens.entries()) {
      // Installs 0 to 10 use lists 10 to 20; 11 and 12 use list 99.
      const listId = index > 10 ? "99" : String(10 + index);
      await send(token, [report({ list: { id: listId }, userId: "1001" })]);
    }
    await send(installTokens[0] ?? "", [
      report({ list: { id: "10" }, userId: "1002" }),
      postReport({ userId: "1003" }),
    ]);
    const token = installTokens[0] ?? "";
    const all = await request(app)
      .get("/v1/blocklist")
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(
      all.body.accounts.map((a: { listIds: string[] }) => a.listIds)
    ).toEqual([
      ["99", "10", "11", "12", "13", "14", "15", "16", "17", "18"],
      ["10"],
      [],
    ]);
    const filtered = await request(app)
      .get("/v1/blocklist")
      .query({ listId: "10", minReporters: "2" })
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(filtered.body.accounts).toHaveLength(1);
    expect(filtered.body.accounts[0]).toMatchObject({
      reporters: 13,
      userId: "1001",
    });
    const lists = await request(app)
      .get("/v1/lists")
      .query({ limit: "2" })
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(lists.body.lists.map((list: { id: string }) => list.id)).toEqual([
      "10",
      "11",
    ]);
    expect(lists.body.lists[0]).toMatchObject({ accounts: 2, reporters: 1 });
    expect(lists.body.nextCursor).toBe("11");
  });

  it("needs a valid token for the lists", async () => {
    const { app } = setup();
    await request(app).get("/v1/lists").expect(401);
  });
});

describe("GET /v1/blocklist", () => {
  const seed = async () => {
    const context = setup();
    const { app, createInstall, send } = context;
    const first = await createInstall();
    const second = await createInstall();
    await send(first.token, [
      report({ userId: "1001" }),
      report({ screenName: "old_name", userId: "1002" }),
      report({ reportedAt: "2026-11-01T00:00:00.000Z", userId: "1003" }),
    ]);
    await send(second.token, [
      postReport({ action: "mute", userId: "1001" }),
      report({
        reportedAt: "2026-11-07T11:30:00.000Z",
        screenName: "new_name",
        userId: "1002",
      }),
      report({
        action: "mute",
        reportedAt: "2026-11-07T10:00:00.000Z",
        screenName: "stale_name",
        userId: "1002",
      }),
    ]);
    const list = (query: Record<string, string> = {}) =>
      request(app)
        .get("/v1/blocklist")
        .query(query)
        .auth(first.token, { type: "bearer" })
        .expect(200);
    return { ...context, list };
  };

  it("needs a valid token", async () => {
    const { app } = setup();
    await request(app).get("/v1/blocklist").expect(401);
  });

  it("counts distinct reporting installs and keeps the newest handle", async () => {
    const { list } = await seed();
    const { body } = await list();
    expect(body).toEqual({
      accounts: [
        {
          firstReportedAt: "2026-11-07T11:00:00.000Z",
          lastReportedAt: "2026-11-07T11:00:00.000Z",
          listIds: [LIST_ID],
          name: "Slop Bot",
          reporters: 2,
          screenName: "slop_bot",
          userId: "1001",
        },
        {
          firstReportedAt: "2026-11-07T10:00:00.000Z",
          lastReportedAt: "2026-11-07T11:30:00.000Z",
          listIds: [LIST_ID],
          name: "Slop Bot",
          reporters: 2,
          screenName: "new_name",
          userId: "1002",
        },
        {
          firstReportedAt: "2026-11-01T00:00:00.000Z",
          lastReportedAt: "2026-11-01T00:00:00.000Z",
          listIds: [LIST_ID],
          name: "Slop Bot",
          reporters: 1,
          screenName: "slop_bot",
          userId: "1003",
        },
      ],
      nextCursor: null,
    });
  });

  it("filters by reporter count and by time", async () => {
    const { list } = await seed();
    const ids = (body: { accounts: { userId: string }[] }) =>
      body.accounts.map((account) => account.userId);
    expect(ids((await list({ minReporters: "2" })).body)).toEqual([
      "1001",
      "1002",
    ]);
    expect(
      ids((await list({ since: "2026-11-07T11:15:00.000Z" })).body)
    ).toEqual(["1002"]);
  });

  it("pages with a cursor", async () => {
    const { list } = await seed();
    const first = await list({ limit: "2" });
    expect(first.body.accounts).toHaveLength(2);
    expect(first.body.nextCursor).toBe("1002");
    const second = await list({ cursor: "1002", limit: "2" });
    expect(
      second.body.accounts.map((a: { userId: string }) => a.userId)
    ).toEqual(["1003"]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("dates a report from the future at the time it arrived", async () => {
    const { app, createInstall, setNow } = setup();
    const { token } = await createInstall();
    setNow(new Date("2026-11-07T12:05:00.000Z"));
    await request(app)
      .post("/v1/reports")
      .auth(token, { type: "bearer" })
      .send({ reports: [report({ reportedAt: "2030-01-01T00:00:00.000Z" })] })
      .expect(200);
    const { body } = await request(app)
      .get("/v1/blocklist")
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(body.accounts[0].lastReportedAt).toBe("2026-11-07T12:05:00.000Z");
  });

  it("rejects an invalid query", async () => {
    const { app, createInstall } = setup();
    const { token } = await createInstall();
    await request(app)
      .get("/v1/blocklist?minReporters=0")
      .auth(token, { type: "bearer" })
      .expect(400);
  });
});

describe("GET /v1/stats", () => {
  it("is public, cached, and shows only masked handles of blocked accounts", async () => {
    const { app, createInstall, send, setNow } = setup();
    const { token } = await createInstall();
    await send(token, [
      report({ screenName: "slop_bot", userId: "1001" }),
      report({
        reportedAt: "2026-11-07T11:30:00.000Z",
        screenName: "spam",
        userId: "1002",
      }),
      report({ action: "mute", screenName: "muted_only", userId: "1003" }),
    ]);
    const response = await request(app)
      .get("/v1/stats")
      .set("origin", "https://lustre.example")
      .expect(200);
    expect(response.body).toEqual({
      accountsBlocked: 2,
      recent: [
        {
          blockedAt: "2026-11-07T11:30:00.000Z",
          maskedHandle: "s\u2022\u2022\u2022",
        },
        {
          blockedAt: "2026-11-07T11:00:00.000Z",
          maskedHandle: "slo\u2022\u2022\u2022bot",
        },
      ],
    });
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(JSON.stringify(response.body)).not.toMatch(/100\d|slop_bot|spam/);

    await send(token, [report({ userId: "1004" })]);
    setNow(new Date("2026-11-07T12:00:59.000Z"));
    expect((await request(app).get("/v1/stats")).body.accountsBlocked).toBe(2);
    setNow(new Date("2026-11-07T12:01:00.000Z"));
    expect((await request(app).get("/v1/stats")).body.accountsBlocked).toBe(3);
  });

  it("allows only GET from other origins", async () => {
    const { app } = setup();
    const response = await request(app)
      .options("/v1/stats")
      .set("origin", "https://lustre.example")
      .set("access-control-request-method", "GET")
      .expect(204);
    expect(response.headers["access-control-allow-methods"]).toBe("GET");
    await request(app).post("/v1/stats").expect(404);
  });

  it("limits requests per IP address", async () => {
    const { app } = setup({ statsPerIp: 1 });
    await request(app).get("/v1/stats").expect(200);
    const response = await request(app).get("/v1/stats").expect(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("unknown routes", () => {
  it("answer 404 as JSON", async () => {
    const { app } = setup();
    const response = await request(app).get("/v1/nothing").expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
