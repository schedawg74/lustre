// Cloudflare's proxy ranges from https://www.cloudflare.com/ips/, copied
// 2026-06-29. Check the page before you turn on `cloudflareProxy`.
export const CLOUDFLARE_IPV4_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

export const CLOUDFLARE_IPV6_RANGES = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

export const CLOUDFLARE_RANGES = [
  ...CLOUDFLARE_IPV4_RANGES,
  ...CLOUDFLARE_IPV6_RANGES,
];

const ANYWHERE = ["0.0.0.0/0", "::/0"];

export type FirewallRule = {
  description: string;
  direction: "in";
  port: string;
  protocol: "tcp" | "udp";
  sourceIps: string[];
};

// Only HTTP and HTTPS are public. Tailscale reaches the host through NAT
// traversal, so no SSH or WireGuard port is open.
// Behind Cloudflare, only Cloudflare can connect. Cloudflare talks to the
// origin over TCP, so UDP 443 (HTTP/3) stays closed. Port 80 stays open to
// Cloudflare for the Let's Encrypt HTTP challenge.
export const firewallRules = (cloudflareProxy: boolean): FirewallRule[] => {
  const sourceIps = cloudflareProxy ? CLOUDFLARE_RANGES : ANYWHERE;
  const rules: FirewallRule[] = [
    {
      description: "HTTP",
      direction: "in",
      port: "80",
      protocol: "tcp",
      sourceIps,
    },
    {
      description: "HTTPS",
      direction: "in",
      port: "443",
      protocol: "tcp",
      sourceIps,
    },
  ];
  if (!cloudflareProxy) {
    rules.push({
      description: "HTTP/3",
      direction: "in",
      port: "443",
      protocol: "udp",
      sourceIps,
    });
  }
  return rules;
};
