import { describe, expect, it } from "vitest";
import {
  buildCloudInit,
  caddyfile,
  deployScript,
  type HostInput,
  SERVER_IMAGE,
} from "./host";

const input: HostInput = {
  acmeEmail: "owner@example.com",
  backup: {
    accessKeyId: "ACCESSKEY",
    bucket: "lustre-backup",
    endpoint: "https://nbg1.your-objectstorage.com",
    region: "nbg1",
    secretAccessKey: "secret-key",
  },
  domain: "blocklist.example.com",
  serverImageTag: "latest",
  tailscaleAuthKey: "tskey-auth-abc",
  tailscaleHostname: "lustre",
  tailscaleTag: "tag:lustre",
  volumeId: "4711",
};

const cloudInit = buildCloudInit(input);

describe("buildCloudInit", () => {
  it("is cloud-config", () => {
    expect(cloudInit.startsWith("#cloud-config\n")).toBe(true);
  });

  it("mounts the volume at /data", () => {
    expect(cloudInit).toContain("/dev/disk/by-id/scsi-0HC_Volume_4711");
    expect(cloudInit).toContain("mountpoint -q /data || mount /data");
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

  it("joins the tailnet with a tag, deletes the key, and stops OpenSSH", () => {
    expect(cloudInit).toContain(
      "tailscale up --auth-key=file:/etc/lustre/tailscale-auth-key --hostname=lustre --advertise-tags=tag:lustre --ssh"
    );
    expect(cloudInit).toContain("shred -u /etc/lustre/tailscale-auth-key");
    expect(cloudInit).toContain(
      "systemctl disable --now ssh.service ssh.socket"
    );
  });

  it("blocks the metadata service for containers", () => {
    expect(cloudInit).toContain("DOCKER-USER -d 169.254.169.254/32 -j DROP");
  });

  it("starts the server image with the stack's tag", () => {
    expect(cloudInit).toContain(`image: ${SERVER_IMAGE}:\${SERVER_TAG:?`);
    expect(cloudInit).toContain("SERVER_TAG=latest");
    expect(cloudInit).toContain("bucket: lustre-backup");
  });

  it("indents every file below its key", () => {
    const lines = cloudInit.split("\n");
    const contentStart = lines.indexOf("    content: |");
    expect(lines[contentStart + 1]).toMatch(/^ {6}\S/);
  });
});

describe("caddyfile", () => {
  it("proxies the domain to the server", () => {
    expect(caddyfile(input)).toBe(
      "{\n\temail owner@example.com\n}\n\nblocklist.example.com {\n\tencode zstd gzip\n\treverse_proxy server:3000\n}\n"
    );
  });

  it("omits the global block without an email", () => {
    expect(caddyfile({ ...input, acmeEmail: undefined })).toMatch(
      /^blocklist\.example\.com \{/
    );
  });
});

describe("deployScript", () => {
  it("checks the tag before it writes .env", () => {
    const script = deployScript();
    expect(script.indexOf("case")).toBeLessThan(script.indexOf("> .env"));
    expect(script).toContain("docker compose pull\ndocker compose up -d");
  });
});
