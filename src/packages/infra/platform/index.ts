import { Firewall, Server, Volume, VolumeAttachment } from "@pulumi/hcloud";
import { all, secret } from "@pulumi/pulumi";
import { readSettings } from "./config";
import { CLOUDFLARE_RANGES, firewallRules } from "./firewall";
import { buildCloudInit } from "./host";

const settings = readSettings();
const labels = { project: "lustre", service: "blocklist" };

const firewall = new Firewall("lustre-web", {
  labels,
  name: "lustre-web",
  rules: firewallRules(settings.cloudflareProxy),
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
        backup: {
          accessKeyId,
          bucket,
          endpoint: settings.backup.endpoint,
          region: settings.backup.region,
          secretAccessKey,
        },
        domain: settings.domain,
        tailscaleAuthKey,
        tailscaleHostname: settings.tailscaleHostname,
        tailscaleTag: settings.tailscaleTag,
        trustedProxies: settings.cloudflareProxy ? CLOUDFLARE_RANGES : [],
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

// Point the A and AAAA records of <domain>, www.<domain>, and api.<domain> to
// these addresses (or to Cloudflare's proxy, see cloudflareProxy).
export const { ipv4Address, ipv6Address } = server;
// The device on the host is /dev/disk/by-id/scsi-0HC_Volume_<dataVolumeId>.
export const dataVolumeId = attachment.volumeId;
export const { cloudflareProxy, domain, tailscaleHostname } = settings;
export const websiteUrl = `https://${settings.domain}`;
export const apiUrl = `https://api.${settings.domain}`;
