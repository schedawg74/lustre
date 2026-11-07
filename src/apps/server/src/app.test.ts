import type { Report } from "@lustre/api/v1";
import { installs } from "@lustre/db";
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
    limits: { installsPerIp: 100, perIp: 1000, perToken: 1000, ...limits },
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
  return { app, createInstall, db, setNow };
};

const report = (overrides: Partial<Report> = {}): Report => ({
  action: "block",
  name: "Slop Bot",
  reportedAt: "2026-11-07T11:00:00.000Z",
  screenName: "slop_bot",
  source: "list:2116659176894071283",
  userId: "1001",
  ...overrides,
});

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

describe("GET /v1/blocklist", () => {
  const seed = async () => {
    const context = setup();
    const { app, createInstall } = context;
    const first = await createInstall();
    const second = await createInstall();
    const send = (token: string, reports: Report[]) =>
      request(app)
        .post("/v1/reports")
        .auth(token, { type: "bearer" })
        .send({ reports })
        .expect(200);
    await send(first.token, [
      report({ userId: "1001" }),
      report({ screenName: "old_name", userId: "1002" }),
      report({ reportedAt: "2026-11-01T00:00:00.000Z", userId: "1003" }),
    ]);
    await send(second.token, [
      report({ action: "mute", source: "post", userId: "1001" }),
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
          name: "Slop Bot",
          reporters: 2,
          screenName: "slop_bot",
          userId: "1001",
        },
        {
          firstReportedAt: "2026-11-07T10:00:00.000Z",
          lastReportedAt: "2026-11-07T11:30:00.000Z",
          name: "Slop Bot",
          reporters: 2,
          screenName: "new_name",
          userId: "1002",
        },
        {
          firstReportedAt: "2026-11-01T00:00:00.000Z",
          lastReportedAt: "2026-11-01T00:00:00.000Z",
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

describe("unknown routes", () => {
  it("answer 404 as JSON", async () => {
    const { app } = setup();
    const response = await request(app).get("/v1/nothing").expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
