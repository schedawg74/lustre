import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./config";

describe("parseServerEnv", () => {
  it("applies defaults", () => {
    expect(parseServerEnv({ DATABASE_PATH: "/data/lustre.db" })).toEqual({
      DATABASE_PATH: "/data/lustre.db",
      LOG_LEVEL: "info",
      MIGRATIONS_FOLDER: "migrations",
      PORT: 3000,
      TRUST_PROXY_HOPS: 0,
    });
  });

  it("requires a database path", () => {
    expect(() => parseServerEnv({})).toThrow("DATABASE_PATH");
  });

  it("rejects a port out of range", () => {
    expect(() =>
      parseServerEnv({ DATABASE_PATH: "x.db", PORT: "70000" })
    ).toThrow();
  });
});
