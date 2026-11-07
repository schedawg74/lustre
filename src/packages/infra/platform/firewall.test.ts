import { describe, expect, it } from "vitest";
import { CLOUDFLARE_RANGES, firewallRules } from "./firewall";

const CIDR = /^[\da-f:.]+\/\d{1,3}$/;

describe("firewallRules", () => {
  it("opens HTTP, HTTPS, and HTTP/3 to everyone by default", () => {
    expect(
      firewallRules(false).map(
        ({ port, protocol, sourceIps }) =>
          `${protocol}/${port} ${sourceIps.join(",")}`
      )
    ).toEqual([
      "tcp/80 0.0.0.0/0,::/0",
      "tcp/443 0.0.0.0/0,::/0",
      "udp/443 0.0.0.0/0,::/0",
    ]);
  });

  it("admits only Cloudflare over TCP behind the proxy", () => {
    const rules = firewallRules(true);
    expect(rules.map(({ port, protocol }) => `${protocol}/${port}`)).toEqual([
      "tcp/80",
      "tcp/443",
    ]);
    for (const rule of rules) {
      expect(rule.sourceIps).toEqual(CLOUDFLARE_RANGES);
    }
  });

  it("never opens SSH", () => {
    for (const rule of [...firewallRules(false), ...firewallRules(true)]) {
      expect(rule.port).not.toBe("22");
      expect(rule.direction).toBe("in");
    }
  });

  it("lists valid, unique CIDR ranges", () => {
    expect(new Set(CLOUDFLARE_RANGES).size).toBe(CLOUDFLARE_RANGES.length);
    for (const range of CLOUDFLARE_RANGES) {
      expect(range).toMatch(CIDR);
    }
  });
});
