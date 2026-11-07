import { readFileSync } from "node:fs";
import { isSecret, runtime } from "@pulumi/pulumi";
import { beforeAll, describe, expect, it } from "vitest";
import { readSettings } from "./config";

const stackConfig: Record<string, string> = {
  "lustre-platform:backupAccessKeyId": "ACCESSKEY",
  "lustre-platform:backupBucket": "lustre-backup",
  "lustre-platform:backupLocation": "nbg1",
  "lustre-platform:backupSecretAccessKey": "secret-key",
  "lustre-platform:domain": "lustre.example.com",
  "lustre-platform:location": "fsn1",
  "lustre-platform:serverType": "cax11",
  "lustre-platform:tailscaleAuthKey": "tskey-auth-abc123-def456",
  "lustre-platform:tailscaleHostname": "lustre",
  "lustre-platform:tailscaleTag": "tag:lustre",
  "lustre-platform:volumeSizeGb": "10",
};

const readWith = (overrides: Record<string, string> = {}) => {
  runtime.setAllConfig({ ...stackConfig, ...overrides });
  return readSettings();
};

const without = (key: string) => {
  const { [`lustre-platform:${key}`]: _, ...rest } = stackConfig;
  runtime.setAllConfig(rest);
  return readSettings;
};

beforeAll(async () => {
  await runtime.setMocks(
    { call: () => ({}), newResource: () => ({ id: "1", state: {} }) },
    "lustre-platform",
    "production",
    false
  );
});

describe("readSettings", () => {
  it("reads a complete stack", () => {
    const settings = readWith();
    expect(settings).toMatchObject({
      backup: {
        endpoint: "https://nbg1.your-objectstorage.com",
        region: "nbg1",
      },
      cloudflareProxy: false,
      domain: "lustre.example.com",
      location: "fsn1",
      serverType: "cax11",
      volumeSizeGb: 10,
    });
  });

  it.each([
    ["location", "eu-central-1"],
    ["serverType", "t4g.small"],
    ["domain", "https://lustre.example.com"],
    ["domain", "Lustre.Example.com"],
    ["domain", "lustre.example.com/path"],
    ["tailscaleTag", "lustre"],
    ["tailscaleHostname", "Lustre Host"],
    ["tailscaleAuthKey", "not-a-key"],
    ["backupLocation", "ash"],
    ["backupBucket", "Bad_Bucket"],
    ["backupSecretAccessKey", "two\nlines"],
    ["cloudflareProxy", "yes"],
    ["volumeSizeGb", "5"],
  ])("rejects %s = %j", (key, value) => {
    expect(() => readWith({ [`lustre-platform:${key}`]: value })).toThrow(key);
  });

  it("turns on the Cloudflare proxy only when the stack says so", () => {
    expect(
      readWith({ "lustre-platform:cloudflareProxy": "true" }).cloudflareProxy
    ).toBe(true);
    expect(without("cloudflareProxy")().cloudflareProxy).toBe(false);
  });

  it("rejects an Arm server outside the EU", () => {
    expect(() => readWith({ "lustre-platform:location": "ash" })).toThrow(
      "not available in ash"
    );
    expect(
      readWith({
        "lustre-platform:location": "ash",
        "lustre-platform:serverType": "cpx21",
      }).location
    ).toBe("ash");
  });

  it.each([
    "domain",
    "tailscaleAuthKey",
    "backupBucket",
    "backupAccessKeyId",
    "backupSecretAccessKey",
  ])("has no default for %s", (key) => {
    expect(without(key)).toThrow(key);
  });

  it("marks credentials as secrets", async () => {
    const settings = readWith();
    for (const value of [
      settings.tailscaleAuthKey,
      settings.backup.accessKeyId,
      settings.backup.secretAccessKey,
      settings.backup.bucket,
    ]) {
      await expect(isSecret(value)).resolves.toBe(true);
    }
  });

  it("keeps secrets out of the production stack file", () => {
    const file = readFileSync(
      new URL("./Pulumi.production.yaml", import.meta.url),
      "utf8"
    );
    expect(file).not.toMatch(/tskey-|secretAccessKey: [^{]/);
    expect(file).toMatch(/^ {2}lustre-platform:serverType: cax11$/m);
    expect(file).toMatch(/^ {2}lustre-platform:cloudflareProxy: "false"$/m);
  });
});
