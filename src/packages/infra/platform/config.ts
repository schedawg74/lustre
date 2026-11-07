import { Config } from "@pulumi/pulumi";

// Hetzner Cloud locations. Arm servers (cax) exist only in the EU locations.
export const LOCATIONS = ["fsn1", "nbg1", "hel1", "ash", "hil", "sin"];
const ARM_LOCATIONS = ["fsn1", "nbg1", "hel1"];
// Hetzner Object Storage locations.
const OBJECT_STORAGE_LOCATIONS = ["fsn1", "nbg1", "hel1"];

const SERVER_TYPE = /^(cax|cx|cpx|ccx)\d{2}$/;
const DOMAIN =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const TAILSCALE_HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TAILSCALE_TAG = /^tag:[a-z0-9-]{1,63}$/;
// Values go into files on the host. A line break or quote could change them.
const SINGLE_LINE = /^[^\s"'\\]+$/;

export const readSettings = () => {
  const config = new Config();
  const location = config.require("location", { allowedValues: LOCATIONS });
  const serverType = config.require("serverType", { pattern: SERVER_TYPE });
  if (serverType.startsWith("cax") && !ARM_LOCATIONS.includes(location)) {
    throw new Error(
      `serverType ${serverType} is not available in ${location}. Arm servers run in ${ARM_LOCATIONS.join(", ")}.`
    );
  }
  const backupLocation = config.require("backupLocation", {
    allowedValues: OBJECT_STORAGE_LOCATIONS,
  });
  return {
    backup: {
      accessKeyId: config.requireSecret("backupAccessKeyId", {
        pattern: SINGLE_LINE,
      }),
      bucket: config.requireSecret("backupBucket", {
        pattern: /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
      }),
      endpoint: `https://${backupLocation}.your-objectstorage.com`,
      region: backupLocation,
      secretAccessKey: config.requireSecret("backupSecretAccessKey", {
        pattern: SINGLE_LINE,
      }),
    },
    // Put Cloudflare's proxy in front of the host. The firewall then admits
    // HTTP and HTTPS only from Cloudflare. Off by default; see the README.
    cloudflareProxy: config.getBoolean("cloudflareProxy") ?? false,
    // The apex domain. The website is served on it, the API on api.<domain>,
    // and www.<domain> redirects to the apex.
    domain: config.require("domain", { pattern: DOMAIN }),
    location,
    serverType,
    // A tagged, pre-approved auth key. The host deletes it after it joins the tailnet.
    tailscaleAuthKey: config.requireSecret("tailscaleAuthKey", {
      pattern: /^tskey-[\w-]+$/,
    }),
    tailscaleHostname: config.require("tailscaleHostname", {
      pattern: TAILSCALE_HOSTNAME,
    }),
    tailscaleTag: config.require("tailscaleTag", { pattern: TAILSCALE_TAG }),
    volumeSizeGb: config.requireNumber("volumeSizeGb", {
      max: 10_240,
      min: 10,
    }),
  };
};

export type Settings = ReturnType<typeof readSettings>;
