// Cloud-init of the Lustre host. Pure functions, so tests can read the result
// without Pulumi.
//
// Cloud-init prepares the host and writes the values that come from the stack
// (/etc/lustre/*.env). The runtime files (compose.yaml, Caddyfile,
// litestream.yml, deploy scripts) are in ../host. deploy-server.yml copies them
// to /data/app on the data volume, so a new server with the same volume starts
// the services again without a deploy.

// The `node` user of the server image. The SQLite directory belongs to it.
const APP_UID = 1000;
const APP_DIR = "/data/app";
const ENV_DIR = "/etc/lustre";
const AUTH_KEY_FILE = `${ENV_DIR}/tailscale-auth-key`;
const METADATA_IP = "169.254.169.254/32";

export type HostInput = {
  backup: {
    accessKeyId: string;
    bucket: string;
    endpoint: string;
    region: string;
    secretAccessKey: string;
  };
  domain: string;
  tailscaleAuthKey: string;
  tailscaleHostname: string;
  tailscaleTag: string;
  // Caddy takes the client address from CF-Connecting-IP only from these ranges.
  trustedProxies: string[];
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

export const caddyEnv = ({
  domain,
  trustedProxies,
}: Pick<HostInput, "domain" | "trustedProxies">) =>
  `LUSTRE_DOMAIN=${domain}\nLUSTRE_TRUSTED_PROXIES=${trustedProxies.join(" ")}\n`;

export const litestreamEnv = ({ backup }: Pick<HostInput, "backup">) =>
  [
    `LITESTREAM_ACCESS_KEY_ID=${backup.accessKeyId}`,
    `LITESTREAM_SECRET_ACCESS_KEY=${backup.secretAccessKey}`,
    `LITESTREAM_BUCKET=${backup.bucket}`,
    `LITESTREAM_ENDPOINT=${backup.endpoint}`,
    `LITESTREAM_REGION=${backup.region}`,
    "",
  ].join("\n");

const SYSCTL = `net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv4.tcp_syncookies = 1
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
`;

// Security updates every day. Ubuntu's 50unattended-upgrades selects the
// security origin and does not reboot.
const AUTO_UPGRADES = `APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
`;

// Docker must not start containers before the volume is mounted. They would
// write to the root disk below /data.
const DOCKER_NEEDS_DATA = `[Unit]
RequiresMountsFor=/data
`;

// Containers must not read the user data (it holds secrets) from the metadata service.
const metadataGuardUnit = () => `[Unit]
Description=Block the Hetzner metadata service for containers
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'iptables -N DOCKER-USER 2>/dev/null || true; iptables -C DOCKER-USER -d ${METADATA_IP} -j DROP 2>/dev/null || iptables -I DOCKER-USER -d ${METADATA_IP} -j DROP'

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

# Tailscale SSH replaces OpenSSH. The Hetzner firewall blocks port 22 as well.
DEBIAN_FRONTEND=noninteractive apt-get purge -y openssh-server
# Without an SSH key, Hetzner sets a root password that must be changed at the
# first login, which blocks Tailscale SSH. Lock it; the break-glass path is the
# Hetzner rescue system.
passwd -l root
chage -d -1 root
sysctl --system

# The volume is attached after the server starts. Wait for it.
device=/dev/disk/by-id/scsi-0HC_Volume_${volumeId}
for _ in $(seq 60); do
  [ -e "$device" ] && break
  sleep 5
done
[ -e "$device" ] || { echo "Volume $device is missing" >&2; exit 1; }
mkdir -p /data
grep -q " /data " /etc/fstab || echo "$device /data ext4 discard,nofail,defaults 0 2" >> /etc/fstab
systemctl daemon-reload
mountpoint -q /data || mount /data

curl -fsSL https://get.docker.com | sh
systemctl daemon-reload
systemctl enable --now docker lustre-metadata-guard.service

id -u deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash --groups docker deploy
install -d -o ${APP_UID} -g ${APP_UID} -m 0750 /data/db
install -d -m 0700 /data/caddy
install -d -o deploy -g deploy -m 0755 ${APP_DIR} /data/www /data/www/releases
chown deploy:deploy ${ENV_DIR}/litestream.env

curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --auth-key=file:${AUTH_KEY_FILE} --hostname=${tailscaleHostname} --advertise-tags=${tailscaleTag} --ssh
shred -u ${AUTH_KEY_FILE}

# A new server on a used volume starts the last deployed runtime. On a new
# volume, the first run of deploy-server.yml starts it.
if [ -f ${APP_DIR}/compose.yaml ]; then
  cd ${APP_DIR}
  sudo -u deploy docker compose up -d
fi
`;

export const buildCloudInit = (input: HostInput) => `#cloud-config
package_update: true
package_upgrade: true
packages: [ca-certificates, curl, sqlite3, unattended-upgrades]
write_files:
${writeFile(AUTH_KEY_FILE, input.tailscaleAuthKey, "0600")}
${writeFile(`${ENV_DIR}/caddy.env`, caddyEnv(input))}
${writeFile(`${ENV_DIR}/litestream.env`, litestreamEnv(input), "0600")}
${writeFile("/etc/sysctl.d/99-lustre.conf", SYSCTL)}
${writeFile("/etc/apt/apt.conf.d/20auto-upgrades", AUTO_UPGRADES)}
${writeFile("/etc/docker/daemon.json", '{ "log-driver": "local" }')}
${writeFile("/etc/systemd/system/docker.service.d/10-lustre-data.conf", DOCKER_NEEDS_DATA)}
${writeFile("/etc/systemd/system/lustre-metadata-guard.service", metadataGuardUnit())}
${writeFile("/usr/local/sbin/lustre-bootstrap", bootstrapScript(input), "0700")}
runcmd:
  - [/usr/local/sbin/lustre-bootstrap]
`;
