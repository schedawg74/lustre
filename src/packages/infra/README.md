# Infrastructure

Pulumi program and host runtime files for the Lustre host on Hetzner Cloud: the blocklist API on `api.<domain>` and the website on `<domain>`.
Read [infrastructure memory](../../../.agents/memory/infrastructure.md) for the layout, Caddy routes, deploy, rollback, backup, and restore steps.

| Project | Folder | Stacks | Owns |
| --- | --- | --- | --- |
| `lustre-platform` | `platform/` | `production` | Server, data volume, firewall, cloud-init (hardening, volume, Docker, Tailscale, stack values) |

## Layout

```text
platform/
  Pulumi.yaml                    project; runs index.ts through tsx (TypeScript 7)
  Pulumi.production.yaml         stack values without plain secrets
  .env.production.1password      1Password references for the Pulumi CLI and the stack secrets
  config.ts                      reads and validates the stack values
  firewall.ts                    firewall rules and Cloudflare ranges
  host.ts                        cloud-init and the /etc/lustre env files
  index.ts                       resources and outputs
host/                            runtime files; deploy-server.yml copies them to /data/app
  compose.yaml                   restore, server, litestream, caddy
  caddy/Caddyfile                website, www redirect, API proxy
  litestream.yml                 replication to Hetzner Object Storage
  bin/deploy-server              host side of deploy-server.yml (and API rollback)
  bin/deploy-website             host side of deploy-website.yml (and website rollback)
scripts/
  sync-secrets.sh                copies the stack secrets from 1Password into the stack
```

Infrastructure code imports no workspace code. Biome rejects `@lustre/*` imports in this package.

## Stack values

| Key | Default | Meaning |
| --- | --- | --- |
| `domain` | required | Apex domain. Website on it, API on `api.<domain>`, `www.<domain>` redirects |
| `cloudflareProxy` | `false` | Firewall admits only Cloudflare; Caddy trusts `CF-Connecting-IP`. Read the trade-off in the infrastructure memory first |
| `location`, `serverType`, `volumeSizeGb` | `fsn1`, `cax11`, `10` | Server and volume |
| `tailscaleHostname`, `tailscaleTag` | `lustre`, `tag:lustre` | Tailnet name and tag of the host |
| `backupLocation` | `nbg1` | Object Storage location of the Litestream bucket |
| `tailscaleAuthKey`, `backupBucket`, `backupAccessKeyId`, `backupSecretAccessKey` | secrets | Set by `scripts/sync-secrets.sh` |

Every value goes into the user data. A change replaces the server; the data volume stays.

## Checks

```sh
pnpm --filter @lustre/infra typecheck
pnpm exec vitest run src/packages/infra
```

The tests read the config with Pulumi mocks, render cloud-init (and run `cloud-init schema` when `cloud-init` is installed), and check that the runtime files use only the variables that cloud-init writes. They create no resource. The CI job `host` runs `docker compose config`, `caddy validate`, `shellcheck`, and `actionlint`.

## First setup (owner)

Nothing below has run yet. Do it once, in this order.

1. Create a Hetzner Cloud project and an API token (read and write). Store it as the GitHub secret `HCLOUD_TOKEN` and in 1Password.
2. In Hetzner Object Storage, create two private buckets in a location other than the server (for example `nbg1`): one for Pulumi state, one for Litestream. Create an S3 key for each, scoped to its bucket if possible.
3. Choose the domain.
4. Create a reusable, pre-approved Tailscale auth key with the tag `tag:lustre`, and an OAuth client (scope `auth_keys`, tag `tag:ci`) for GitHub Actions. Add this to the tailnet policy (owned in code-infra):

   ```json
   {
     "tagOwners": { "tag:lustre": ["autogroup:admin"], "tag:ci": ["autogroup:admin"] },
     "ssh": [
       { "action": "accept", "src": ["autogroup:admin", "tag:ci"], "dst": ["tag:lustre"], "users": ["deploy"] }
     ]
   }
   ```

   A reusable auth key expires after at most 90 days. The host uses it only at its first boot. Set a fresh key before a change that replaces the server.
5. Create the 1Password vault `lustre-infra` with the items that `platform/.env.production.1password` names. Edit `PULUMI_BACKEND_URL` in that file to the state bucket.
6. Create the stack. The passphrase encrypts the stack secrets; keep it in 1Password and as the GitHub secret `PULUMI_CONFIG_PASSPHRASE`.

   ```sh
   cd src/packages/infra/platform
   op run --env-file=.env.production.1password -- pulumi stack init production --secrets-provider passphrase
   op run --env-file=.env.production.1password -- pulumi config set --stack production domain <domain>
   ../scripts/sync-secrets.sh
   op run --env-file=.env.production.1password -- pulumi preview --stack production
   ```

   `stack init` adds `encryptionsalt` to `Pulumi.production.yaml`. Commit the file: it then holds only encrypted secrets. Run `sync-secrets.sh` again after a secret changes in 1Password.
   Without 1Password, export the variables of that file by hand and use `pulumi config set --secret <key>` with the value on stdin.
7. Run `pulumi up`, or the `Deploy infra` workflow. Point the A and AAAA records of `<domain>`, `www.<domain>`, and `api.<domain>` to the outputs `ipv4Address` and `ipv6Address`.
8. Run the `Deploy server` workflow. The first run pushes the image, then fails at the pull because a new GHCR package is private. Make the package `lustre-server` public and run the workflow again. Then run the `Deploy website` workflow.

Do not create a second stack because the expected one is missing. Check the backend URL and the passphrase first.
Never commit a plain secret.
