// Files and boot script of the Lustre host. Pure functions, so tests can read
// the result without Pulumi.

export const SERVER_IMAGE = "ghcr.io/schedawg74/lustre-server";
const LITESTREAM_IMAGE = "litestream/litestream:0.5.18";
const CADDY_IMAGE = "caddy:2.11.9-alpine";
// The `node` user of the server image. The SQLite directory belongs to it.
const APP_UID = 1000;
const APP_DIR = "/opt/lustre";
const AUTH_KEY_FILE = "/etc/lustre/tailscale-auth-key";
const METADATA_IP = "169.254.169.254/32";

export type HostInput = {
  acmeEmail: string | undefined;
  backup: {
    accessKeyId: string;
    bucket: string;
    endpoint: string;
    region: string;
    secretAccessKey: string;
  };
  domain: string;
  serverImageTag: string;
  tailscaleAuthKey: string;
  tailscaleHostname: string;
  tailscaleTag: string;
  // The Hetzner volume id. Its device is /dev/disk/by-id/scsi-0HC_Volume_<id>.
  volumeId: string;
};

const indent = (text: string, spaces: number) =>
  text
    .trimEnd()
    .split("\n")
    .map((line) => (line === "" ? "" : `${" ".repeat(spaces)}${line}`))
    .join("\n");

const writeFile = (path: string, content: string, permissions = "0644") =>
  [
    `  - path: ${path}`,
    `    permissions: "${permissions}"`,
    "    content: |",
    indent(content, 6),
  ].join("\n");

export const composeFile = () => `name: lustre
services:
  # Restores the database from the backup when /data/db has none, for example on a new volume.
  restore:
    image: ${LITESTREAM_IMAGE}
    command: [restore, -config, /etc/litestream.yml, -if-db-not-exists, -if-replica-exists, /data/lustre.db]
    env_file: litestream.env
    user: "${APP_UID}:${APP_UID}"
    volumes: ["/data/db:/data", "./litestream.yml:/etc/litestream.yml:ro"]
  server:
    image: ${SERVER_IMAGE}:\${SERVER_TAG:?Set SERVER_TAG in .env}
    restart: unless-stopped
    depends_on:
      restore:
        condition: service_completed_successfully
    environment:
      LOG_LEVEL: info
      TRUST_PROXY_HOPS: "1"
    volumes: ["/data/db:/data"]
  # Streams every change of the SQLite file to Hetzner Object Storage.
  litestream:
    image: ${LITESTREAM_IMAGE}
    command: [replicate, -config, /etc/litestream.yml]
    restart: unless-stopped
    depends_on:
      server:
        condition: service_healthy
    env_file: litestream.env
    user: "${APP_UID}:${APP_UID}"
    volumes: ["/data/db:/data", "./litestream.yml:/etc/litestream.yml:ro"]
  caddy:
    image: ${CADDY_IMAGE}
    restart: unless-stopped
    depends_on: [server]
    ports: ["80:80", "443:443", "443:443/udp"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile:ro", "/data/caddy:/data"]
`;

export const caddyfile = ({
  acmeEmail,
  domain,
}: Pick<HostInput, "acmeEmail" | "domain">) => {
  const global = acmeEmail ? `{\n\temail ${acmeEmail}\n}\n\n` : "";
  // Caddy writes no access log by default, so client IP addresses are not stored.
  return `${global}${domain} {\n\tencode zstd gzip\n\treverse_proxy server:3000\n}\n`;
};

export const litestreamConfig = ({
  backup,
}: Pick<HostInput, "backup">) => `snapshot:
  interval: 24h
  # Point-in-time restore for the last 7 days.
  retention: 168h
dbs:
  - path: /data/lustre.db
    replica:
      type: s3
      bucket: ${backup.bucket}
      path: lustre
      endpoint: ${backup.endpoint}
      region: ${backup.region}
`;

export const deployScript = () => `#!/bin/sh
# Usage: deploy.sh <image tag>. deploy-server.yml runs it over Tailscale SSH.
set -eu
tag="\${1:-}"
case "$tag" in
  "" | *[!A-Za-z0-9._-]*) echo "Usage: deploy.sh <image tag>" >&2; exit 2 ;;
esac
cd ${APP_DIR}
printf 'SERVER_TAG=%s\\n' "$tag" > .env
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
`;

// Containers must not read the user data (it holds secrets) from the metadata service.
const metadataGuardUnit = () => `[Unit]
Description=Block the Hetzner metadata service for containers
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'iptables -C DOCKER-USER -d ${METADATA_IP} -j DROP 2>/dev/null || iptables -I DOCKER-USER -d ${METADATA_IP} -j DROP'

[Install]
WantedBy=multi-user.target
`;

export const bootstrapScript = ({
  tailscaleHostname,
  tailscaleTag,
  volumeId,
}: Pick<
  HostInput,
  "tailscaleHostname" | "tailscaleTag" | "volumeId"
>) => `#!/bin/bash
set -euo pipefail

# The volume is attached after the server starts. Wait for it.
device=/dev/disk/by-id/scsi-0HC_Volume_${volumeId}
for _ in $(seq 60); do
  [ -e "$device" ] && break
  sleep 5
done
[ -e "$device" ] || { echo "Volume $device is missing" >&2; exit 1; }
mkdir -p /data
grep -q " /data " /etc/fstab || echo "$device /data ext4 discard,nofail,defaults 0 2" >> /etc/fstab
mountpoint -q /data || mount /data
install -d -o ${APP_UID} -g ${APP_UID} -m 0750 /data/db
install -d -m 0700 /data/caddy

curl -fsSL https://get.docker.com | sh
systemctl daemon-reload
systemctl enable --now docker lustre-metadata-guard.service

id -u deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash --groups docker deploy
chown -R deploy:deploy ${APP_DIR}

curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --auth-key=file:${AUTH_KEY_FILE} --hostname=${tailscaleHostname} --advertise-tags=${tailscaleTag} --ssh
shred -u ${AUTH_KEY_FILE}

cd ${APP_DIR}
sudo -u deploy docker compose up -d

# Tailscale SSH replaces OpenSSH. The Hetzner firewall blocks port 22 as well.
systemctl disable --now ssh.service ssh.socket
`;

export const buildCloudInit = (input: HostInput) => `#cloud-config
package_update: true
package_upgrade: true
packages: [ca-certificates, curl, sqlite3]
write_files:
${writeFile(AUTH_KEY_FILE, input.tailscaleAuthKey, "0600")}
${writeFile("/etc/docker/daemon.json", '{ "log-driver": "local" }')}
${writeFile("/etc/systemd/system/lustre-metadata-guard.service", metadataGuardUnit())}
${writeFile(`${APP_DIR}/compose.yaml`, composeFile())}
${writeFile(`${APP_DIR}/Caddyfile`, caddyfile(input))}
${writeFile(`${APP_DIR}/litestream.yml`, litestreamConfig(input))}
${writeFile(
  `${APP_DIR}/litestream.env`,
  `LITESTREAM_ACCESS_KEY_ID=${input.backup.accessKeyId}\nLITESTREAM_SECRET_ACCESS_KEY=${input.backup.secretAccessKey}`,
  "0600"
)}
${writeFile(`${APP_DIR}/.env`, `SERVER_TAG=${input.serverImageTag}`)}
${writeFile(`${APP_DIR}/deploy.sh`, deployScript(), "0755")}
${writeFile("/usr/local/sbin/lustre-bootstrap", bootstrapScript(input), "0700")}
runcmd:
  - [/usr/local/sbin/lustre-bootstrap]
`;
