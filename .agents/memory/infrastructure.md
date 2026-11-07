# Infrastructure

The blocklist server runs on one Hetzner Cloud server. Pulumi (`src/packages/infra/platform`, project `lustre-platform`, stack `production`) owns the cloud resources. Read [the infra README](../../src/packages/infra/README.md) for the commands.
Nothing is deployed yet. No stack, state backend, or secret exists.

## Layout

| Resource | Setting | Why |
| --- | --- | --- |
| `hcloud.Server` `lustre` | `cax11` (2 Arm vCPU, 4 GB) in `fsn1`, Ubuntu 24.04. Stack values `serverType`, `location` | One small host is enough for SQLite. `config.ts` rejects an Arm type outside `fsn1`, `nbg1`, `hel1` |
| `hcloud.Volume` `lustre-data` | 10 GB ext4, mounted at `/data`. `protect` and `deleteProtection` on | The database outlives the server |
| `hcloud.Firewall` `lustre-web` | Inbound TCP 80, TCP 443, UDP 443 (HTTP/3) only | No public SSH. Tailscale needs no inbound port (NAT traversal) |
| Hetzner Object Storage | Bucket from the stack secret `backupBucket` in `backupLocation` (default `nbg1`, another site than the server) | Litestream replica. Created by hand; the hcloud provider has no bucket resource |

On the host (`platform/host.ts` renders all files into the cloud-init user data):

- `/usr/local/sbin/lustre-bootstrap` waits for the volume, mounts it at `/data` through `/etc/fstab`, installs Docker (`get.docker.com`) and Tailscale, joins the tailnet with `tailscaleTag` and Tailscale SSH, deletes the auth key, starts Compose, and stops OpenSSH.
- `/opt/lustre/compose.yaml` (owner `deploy`): `restore` (Litestream restore when `/data/db/lustre.db` is missing), `server` (`ghcr.io/schedawg74/lustre-server:${SERVER_TAG}`), `litestream` (continuous replication), `caddy` (TLS for `domain`, proxy to `server:3000`).
- `/opt/lustre/.env` holds `SERVER_TAG`. `/opt/lustre/deploy.sh <tag>` writes it, then runs `docker compose pull` and `docker compose up -d`.
- `lustre-metadata-guard.service` drops container traffic to `169.254.169.254`, because the user data holds secrets.
- SQLite lives in `/data/db` (owner uid 1000, the image's `node` user). Caddy certificates live in `/data/caddy`.

A change of the user data (for example a new domain, Caddy, or Litestream version) replaces the server (`deleteBeforeReplace`). The volume stays and is attached again; `restore` skips because the database exists. The new server joins the tailnet again, so the auth key must be reusable, or set a new key first. Remove the old offline device in the Tailscale admin console.

## Access

- Hosts are reached over Tailscale only: `tailscale ssh deploy@lustre` (or `root@lustre`, if the tailnet policy allows it).
- The tailnet policy is owned outside this repository (see `/home/david/dev/code-infra/README.md`). It must give `tag:ci` and the owner Tailscale SSH access as `deploy` to `tag:lustre`, with `action: accept` (not `check`, which needs a browser).

## Deploy

- `deploy-server.yml` (manual, `confirm` repeats the ref name): runs CI, builds `linux/amd64` and `linux/arm64`, pushes `ghcr.io/schedawg74/lustre-server:<sha>` and `:latest`, joins the tailnet as an ephemeral `tag:ci` node, runs `deploy.sh <sha>` on the host, and checks `https://<domain>/health`.
- `deploy-infra.yml` (manual): `pulumi preview`, or `pulumi up` with `confirm=production`, in the `infra-production` environment (add a required reviewer).
- Secrets, by name: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` (environment `production`); `HCLOUD_TOKEN`, `PULUMI_CONFIG_PASSPHRASE`, `PULUMI_STATE_ACCESS_KEY_ID`, `PULUMI_STATE_SECRET_ACCESS_KEY` (environment `infra-production`). Variables: `LUSTRE_TAILSCALE_HOST`, `LUSTRE_DOMAIN`, `PULUMI_BACKEND_URL`.
- The GHCR package `lustre-server` must be public, because the host pulls without a login. The image holds no secret.
- Rollback: `tailscale ssh deploy@lustre /opt/lustre/deploy.sh <older sha>`.

## Backup

- Litestream 0.5 replicates the WAL to `s3://<bucket>/lustre` within seconds. It writes a snapshot every 24 h and keeps 7 days (`litestream.yml`), so any point in the last 7 days can be restored.
- The keys are in `/opt/lustre/litestream.env` (mode 0600). Use a key that can access only the backup bucket.
- The volume is the primary copy; Hetzner volumes have no automatic snapshots.

## Restore

Check the backup (on the host):

```sh
cd /opt/lustre
docker compose run --rm restore ltx /data/lustre.db           # list backup files
```

Restore after data loss on a running host:

```sh
cd /opt/lustre
docker compose stop server litestream
mv /data/db/lustre.db /data/db/lustre.db.broken
rm -f /data/db/lustre.db-wal /data/db/lustre.db-shm
docker compose up -d                                   # `restore` runs first, then the server
```

Restore to a point in time: `docker compose run --rm restore restore -config /etc/litestream.yml -timestamp 2026-11-07T12:00:00Z -o /data/lustre.db /data/lustre.db` while the server is stopped and the old file is moved away.

Restore on a new host: create the stack (new volume), and `restore` fills the empty volume from the bucket at the first start.
Test a restore before the blocklist is sold, and after each Litestream upgrade.
