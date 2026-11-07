# Infrastructure

One Hetzner Cloud server runs the blocklist API and the website behind one Caddy. Pulumi (`src/packages/infra/platform`, project `lustre-platform`, stack `production`) owns the cloud resources. Read [the infra README](../../src/packages/infra/README.md) for the commands and the first setup.
Nothing is deployed yet. No stack, state backend, or secret exists.

## Hosts and domains

One stack value, `domain`, is the apex domain. Its A and AAAA records, and those of `www.<domain>` and `api.<domain>`, point to the stack outputs `ipv4Address` and `ipv6Address` (or to Cloudflare, see below). DNS is not managed by Pulumi.

| Address | Served by |
| --- | --- |
| `https://<domain>` | Website (`@lustre/website`, Astro static files) from `/data/www/current` |
| `https://www.<domain>` | 301 to `https://<domain>{uri}` |
| `https://api.<domain>` | Reverse proxy to the API on `127.0.0.1:3000` (`/health`, `/v1/...`) |

## Cloud resources (`platform/index.ts`)

| Resource | Setting | Why |
| --- | --- | --- |
| `hcloud.Server` `lustre` | `cax11` (2 Arm vCPU, 4 GB) in `fsn1`, Ubuntu 24.04. Stack values `serverType`, `location` | One small host is enough for SQLite and static files. `config.ts` rejects an Arm type outside `fsn1`, `nbg1`, `hel1` |
| `hcloud.Volume` `lustre-data` | 10 GB ext4 at `/data`. `protect` and `deleteProtection` on | The database, the runtime files, the website releases, and the certificates outlive the server |
| `hcloud.Firewall` `lustre-web` | `platform/firewall.ts`. Default: TCP 80, TCP 443, UDP 443 from everywhere. `cloudflareProxy=true`: TCP 80 and 443 from Cloudflare ranges only | No public SSH. Tailscale needs no inbound port (NAT traversal) |
| Hetzner Object Storage | Bucket from the stack secret `backupBucket` in `backupLocation` (default `nbg1`, another site than the server) | Litestream replica. Created by hand; the hcloud provider has no bucket resource |

## Host layout

Cloud-init (`platform/host.ts`) prepares the host and writes only the values that come from the stack. The runtime files are committed in `src/packages/infra/host/`; `deploy-server.yml` copies them to the volume.

| Host path | Source | Contents |
| --- | --- | --- |
| `/etc/lustre/caddy.env` | cloud-init | `LUSTRE_DOMAIN`, `LUSTRE_TRUSTED_PROXIES` |
| `/etc/lustre/litestream.env` (0600, owner `deploy`) | cloud-init | Litestream keys, bucket, endpoint, region |
| `/data/app/` (owner `deploy`) | `deploy-server.yml` | `compose.yaml`, `caddy/Caddyfile`, `litestream.yml`, `bin/deploy-server`, `bin/deploy-website`, `.env` (`SERVER_TAG`) |
| `/data/www/releases/<id>/`, `/data/www/current` | `deploy-website.yml` | Website releases; `current` is a relative symlink to one of them |
| `/data/db/` (uid 1000) | the server | `lustre.db` and its WAL |
| `/data/caddy/` | Caddy | Certificates and ACME account |

`/usr/local/sbin/lustre-bootstrap` runs once per server: it removes OpenSSH, locks the root password, applies `/etc/sysctl.d/99-lustre.conf`, mounts the volume through `/etc/fstab`, installs Docker (`get.docker.com`) and Tailscale, joins the tailnet with `tailscaleTag` and Tailscale SSH, deletes the auth key, and starts Compose if `/data/app/compose.yaml` exists.

Hardening (ported from memozero `infra/src/cloud-init/hardening.ts`):

- No OpenSSH and no root password. Access is Tailscale SSH only; the break-glass path is the Hetzner rescue system.
- Daily security updates through `unattended-upgrades` (`20auto-upgrades`). No automatic reboot, so a kernel update waits for a manual reboot.
- `docker.service` has `RequiresMountsFor=/data`, so no container writes below an unmounted `/data`.
- `lustre-metadata-guard.service` drops container traffic to `169.254.169.254`, because the user data holds secrets. Caddy runs in the host network, so the guard does not apply to it.

Compose services (`host/compose.yaml`): `restore` (Litestream restore when `/data/db/lustre.db` is missing), `server` (`ghcr.io/schedawg74/lustre-server:${SERVER_TAG}`, published on `127.0.0.1:3000` only), `litestream` (continuous replication), `caddy` (host network, so the API sees the real client address also for IPv6).

A change of the user data (domain, secrets, `cloudflareProxy`, `host.ts`) replaces the server (`deleteBeforeReplace`). The volume is attached again and the new server starts the last deployed runtime and website from `/data/app` and `/data/www`; `restore` skips because the database exists. The new server joins the tailnet again, so the auth key must still be valid (set a new key first). Remove the old offline device in the Tailscale admin console. A change of a file in `host/` does not touch the server; `deploy-server.yml` ships it.

## Caddy (`host/caddy/Caddyfile`)

- Website: `encode zstd gzip`, `try_files {path} {path}.html`, `404.html` for a missing file. `Cache-Control: public, max-age=31536000, immutable` for `/_astro/*` (hashed names), `public, max-age=0, must-revalidate` for everything else (the ETag keeps it cheap).
- Security headers on all three sites: HSTS (1 year, no preload), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, no `Server` header. The website also gets a CSP (`'self'`, inline scripts and styles for Astro, `connect-src` also `https://api.<domain>` for the `/v1/stats` call) and a `Permissions-Policy`.
- API: `reverse_proxy 127.0.0.1:3000` with `X-Forwarded-For: {client_ip}`, one address, so `TRUST_PROXY_HOPS=1` is correct with and without Cloudflare.
- Caddy writes no access log, so client IP addresses are not stored. TLS comes from Let's Encrypt (HTTP or TLS-ALPN challenge). No ACME email is set: Let's Encrypt has sent no expiry mails since 2025.

## Cloudflare proxy (`cloudflareProxy`, off by default)

When on, the firewall admits TCP 80 and 443 only from `CLOUDFLARE_RANGES` (`platform/firewall.ts`, copied 2026-06-29 from https://www.cloudflare.com/ips/), and Caddy trusts `CF-Connecting-IP` only from these ranges.

- Gains: the origin address is not reachable directly, Cloudflare absorbs floods, and its edge caches the hashed assets.
- Costs: Cloudflare terminates TLS and sees all traffic, also the install tokens in the `Authorization` header; this weakens the privacy rule in [conventions](conventions.md#privacy). No HTTP/3 to the origin. The IP list must be kept current by hand. Cloudflare settings must be: SSL mode Full (strict), "Always Use HTTPS" off (Caddy redirects itself, and the Let's Encrypt HTTP challenge must reach port 80), all three records proxied.
- Not verified: certificate issuance behind the proxy.

## Access

- Hosts are reached over Tailscale only: `tailscale ssh deploy@lustre`.
- The tailnet policy is owned outside this repository (see `/home/david/dev/code-infra/README.md`). It must give `tag:ci` and the owner Tailscale SSH access as `deploy` to `tag:lustre`, with `action: accept` (not `check`, which needs a browser). The fragment is in the infra README.

## Deploy

Both deploy workflows are manual, need `confirm` = the ref name, run CI first, and share the `deploy-production` concurrency group. The CI job `host` checks `docker compose config`, `caddy validate`, `shellcheck`, and `actionlint`.

- `deploy-server.yml`: builds `linux/amd64` and `linux/arm64`, pushes `ghcr.io/schedawg74/lustre-server:<sha>` and `:latest`, joins the tailnet as an ephemeral `tag:ci` node, uploads `src/packages/infra/host` to `/data/app/incoming`, and runs `incoming/bin/deploy-server <sha>`. The script validates the new files (`docker compose config`, `caddy validate`), installs them in `/data/app`, writes `SERVER_TAG`, runs `docker compose pull` and `up -d`, reloads Caddy, and restarts Litestream if `litestream.yml` changed. Then the job checks `https://api.<domain>/health`. Run it once before the first website deploy: it installs Caddy and `bin/deploy-website`.
- `deploy-website.yml`: runs `pnpm --filter @lustre/website build`, packs `src/apps/website/dist`, and pipes it to `/data/app/bin/deploy-website <UTC time>-<sha12>`. The script unpacks into `releases/.<id>`, adds `release.json`, renames the folder, switches `current` with `ln -sfn` and `mv -T` (one rename), and deletes all but the newest 5 releases. The job checks that `https://<domain>/release.json` names the new release; on failure it switches back to the previous release.
- Secrets, by name: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` (environment `production`); `HCLOUD_TOKEN`, `PULUMI_CONFIG_PASSPHRASE`, `PULUMI_STATE_ACCESS_KEY_ID`, `PULUMI_STATE_SECRET_ACCESS_KEY` (environment `infra-production`). Variables: `LUSTRE_TAILSCALE_HOST`, `LUSTRE_DOMAIN` (the apex), `PULUMI_BACKEND_URL`.
- The GHCR package `lustre-server` must be public, because the host pulls without a login. The image holds no secret.
- `deploy-infra.yml` (manual): `pulumi preview`, or `pulumi up` with `confirm=production`, in the `infra-production` environment (add a required reviewer).

## Rollback

- API: `tailscale ssh deploy@lustre /data/app/bin/deploy-server <older sha>`. It uses the installed runtime files. To roll back a runtime file too, run `deploy-server.yml` on the older ref.
- Website: `tailscale ssh deploy@lustre /data/app/bin/deploy-website --rollback` (the release before the current one), `--rollback <id>`, or `--list`.

## Backup

- Litestream 0.5 replicates the WAL to `s3://<bucket>/lustre` within seconds. It writes a snapshot every 24 h and keeps 7 days (`host/litestream.yml`), so any point in the last 7 days can be restored.
- The keys are in `/etc/lustre/litestream.env`. Use a key that can access only the backup bucket.
- The volume is the primary copy; Hetzner volumes have no automatic snapshots. The website needs no backup: a deploy builds it again.

## Restore

Check the backup (on the host):

```sh
cd /data/app
docker compose run --rm restore ltx /data/lustre.db           # list backup files
```

Restore after data loss on a running host:

```sh
cd /data/app
docker compose stop server litestream
mv /data/db/lustre.db /data/db/lustre.db.broken
rm -f /data/db/lustre.db-wal /data/db/lustre.db-shm
docker compose up -d                                   # `restore` runs first, then the server
```

Restore to a point in time: `docker compose run --rm restore restore -config /etc/litestream.yml -timestamp 2026-11-07T12:00:00Z -o /data/lustre.db /data/lustre.db` while the server is stopped and the old file is moved away.

Restore on a new volume: create the stack (new volume), run `deploy-server.yml` (the `restore` service fills the empty volume from the bucket before the server starts), then `deploy-website.yml`.
Test a restore before the blocklist is sold, and after each Litestream upgrade.

## Not ported from memozero

memozero (`/home/david/dev/memozero/infra`) runs a similar host. Skipped on purpose: the `HetznerServiceHost` and `TailnetAccess` components (one host; a Pulumi-minted auth key that rotates would replace the server), fail2ban (no service logs failed logins), Cloudflare DNS records and the DNS challenge Caddy build (DNS stays outside Pulumi), the LGTM observability stack (about 2 GB of the 4 GB), `render-runtime-env.mjs` (the server has no runtime secrets), and the user-data cleanup (root-only files, and the metadata service serves the user data to root anyway).
