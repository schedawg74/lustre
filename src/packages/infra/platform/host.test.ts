import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCloudInit,
  caddyEnv,
  type HostInput,
  litestreamEnv,
} from "./host";

const input: HostInput = {
  backup: {
    accessKeyId: "ACCESSKEY",
    bucket: "lustre-backup",
    endpoint: "https://nbg1.your-objectstorage.com",
    region: "nbg1",
    secretAccessKey: "secret-key",
  },
  domain: "lustre.example.com",
  tailscaleAuthKey: "tskey-auth-abc",
  tailscaleHostname: "lustre",
  tailscaleTag: "tag:lustre",
  trustedProxies: [],
  volumeId: "4711",
};

const cloudInit = buildCloudInit(input);
const hostFile = (path: string) =>
  readFileSync(new URL(`../host/${path}`, import.meta.url), "utf8");
const envKeys = (env: string) =>
  env
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")));

const hasCloudInit = (() => {
  try {
    execFileSync("cloud-init", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("buildCloudInit", () => {
  it("is cloud-config", () => {
    expect(cloudInit.startsWith("#cloud-config\n")).toBe(true);
  });

  it("passes cloud-init schema", ({ skip }) => {
    if (!hasCloudInit) {
      skip("cloud-init is not installed");
    }
    const file = join(mkdtempSync(join(tmpdir(), "lustre-")), "user-data");
    writeFileSync(file, cloudInit);
    expect(() =>
      execFileSync("cloud-init", ["schema", "--config-file", file], {
        stdio: "pipe",
      })
    ).not.toThrow();
  });

  it("mounts the volume at /data before Docker starts", () => {
    expect(cloudInit).toContain("/dev/disk/by-id/scsi-0HC_Volume_4711");
    expect(cloudInit).toContain("mountpoint -q /data || mount /data");
    expect(cloudInit).toContain("RequiresMountsFor=/data");
    expect(cloudInit.indexOf("mount /data")).toBeLessThan(
      cloudInit.indexOf("get.docker.com")
    );
  });

  it("writes secrets only into files that root or the deploy user can read", () => {
    const blocks = cloudInit.split("\n  - path: ");
    const secretBlocks = blocks.filter(
      (block) =>
        block.includes("tskey-auth-abc") || block.includes("secret-key")
    );
    expect(secretBlocks).toHaveLength(2);
    for (const block of secretBlocks) {
      expect(block).toContain('permissions: "0600"');
    }
  });

  it("joins the tailnet with a tag, deletes the key, and removes OpenSSH", () => {
    expect(cloudInit).toContain(
      "tailscale up --auth-key=file:/etc/lustre/tailscale-auth-key --hostname=lustre --advertise-tags=tag:lustre --ssh"
    );
    expect(cloudInit).toContain("shred -u /etc/lustre/tailscale-auth-key");
    expect(cloudInit).toContain("apt-get purge -y openssh-server");
    expect(cloudInit).toContain("passwd -l root");
  });

  it("hardens the kernel network settings and installs security updates", () => {
    expect(cloudInit).toContain("net.ipv4.tcp_syncookies = 1");
    expect(cloudInit).toContain("net.ipv4.conf.all.accept_redirects = 0");
    expect(cloudInit).toContain('APT::Periodic::Unattended-Upgrade "1";');
    expect(cloudInit).toContain("sysctl --system");
  });

  it("blocks the metadata service for containers", () => {
    expect(cloudInit).toContain("DOCKER-USER -d 169.254.169.254/32 -j DROP");
  });

  it("starts the deployed runtime only when the volume has one", () => {
    expect(cloudInit).toContain("if [ -f /data/app/compose.yaml ]; then");
  });

  it("indents every file below its key", () => {
    const lines = cloudInit.split("\n");
    const contentStart = lines.indexOf("    content: |");
    expect(lines[contentStart + 1]).toMatch(/^ {6}\S/);
  });
});

describe("caddyEnv", () => {
  it("sets the domain and no trusted proxy by default", () => {
    expect(caddyEnv(input)).toBe(
      "LUSTRE_DOMAIN=lustre.example.com\nLUSTRE_TRUSTED_PROXIES=\n"
    );
  });

  it("lists the trusted proxies on one line", () => {
    expect(
      caddyEnv({ ...input, trustedProxies: ["173.245.48.0/20", "::1/128"] })
    ).toContain("LUSTRE_TRUSTED_PROXIES=173.245.48.0/20 ::1/128\n");
  });
});

describe("runtime files in ../host", () => {
  it("use only the Caddy variables that cloud-init writes", () => {
    const used = [...hostFile("caddy/Caddyfile").matchAll(/\{\$(\w+)\}/g)].map(
      (match) => match[1]
    );
    expect(new Set(used)).toEqual(new Set(envKeys(caddyEnv(input))));
  });

  it("use only the Litestream variables that cloud-init writes", () => {
    const used = [...hostFile("litestream.yml").matchAll(/\$\{(\w+)\}/g)].map(
      (match) => match[1]
    );
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) {
      expect(envKeys(litestreamEnv(input))).toContain(name);
    }
  });

  it("read the env files that cloud-init writes", () => {
    const compose = hostFile("compose.yaml");
    for (const match of compose.matchAll(/env_file: (\S+)/g)) {
      expect(cloudInit).toContain(`  - path: ${match[1]}\n`);
    }
  });
});
