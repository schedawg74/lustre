import { Firewall, Server, Volume, VolumeAttachment } from "@pulumi/hcloud";
import { all, secret } from "@pulumi/pulumi";
import { readSettings } from "./config";
import { buildCloudInit } from "./host";

const settings = readSettings();
const labels = { project: "lustre", service: "blocklist" };

// Only HTTP and HTTPS are public. Tailscale reaches the host through NAT
// traversal, so no SSH or WireGuard port is open.
const firewall = new Firewall("lustre-web", {
  labels,
  name: "lustre-web",
  rules: [
    { port: "80", protocol: "tcp" },
    { port: "443", protocol: "tcp" },
    { port: "443", protocol: "udp" },
  ].map((rule) => ({
    ...rule,
    direction: "in",
    sourceIps: ["0.0.0.0/0", "::/0"],
  })),
});

// The SQLite database is the product. The volume outlives the server.
const volume = new Volume(
  "lustre-data",
  {
    deleteProtection: true,
    format: "ext4",
    labels,
    location: settings.location,
    name: "lustre-data",
    size: settings.volumeSizeGb,
  },
  { protect: true }
);

const userData = secret(
  all([
    volume.id,
    settings.tailscaleAuthKey,
    settings.backup.accessKeyId,
    settings.backup.bucket,
    settings.backup.secretAccessKey,
  ]).apply(
    ([volumeId, tailscaleAuthKey, accessKeyId, bucket, secretAccessKey]) =>
      buildCloudInit({
        acmeEmail: settings.acmeEmail,
        backup: {
          accessKeyId,
          bucket,
          endpoint: settings.backup.endpoint,
          region: settings.backup.region,
          secretAccessKey,
        },
        domain: settings.domain,
        serverImageTag: settings.serverImageTag,
        tailscaleAuthKey,
        tailscaleHostname: settings.tailscaleHostname,
        tailscaleTag: settings.tailscaleTag,
        volumeId,
      })
  )
);

// A change of the user data replaces the server. The data stays on the volume.
const server = new Server(
  "lustre",
  {
    firewallIds: [firewall.id.apply(Number)],
    image: "ubuntu-24.04",
    labels,
    location: settings.location,
    name: "lustre",
    publicNets: [{ ipv4Enabled: true, ipv6Enabled: true }],
    serverType: settings.serverType,
    userData,
  },
  { deleteBeforeReplace: true }
);

const attachment = new VolumeAttachment("lustre-data", {
  automount: false,
  serverId: server.id.apply(Number),
  volumeId: volume.id.apply(Number),
});

// Point the A and AAAA records of the domain to these addresses.
export const { ipv4Address, ipv6Address } = server;
// The device on the host is /dev/disk/by-id/scsi-0HC_Volume_<dataVolumeId>.
export const dataVolumeId = attachment.volumeId;
export const { domain, tailscaleHostname } = settings;
