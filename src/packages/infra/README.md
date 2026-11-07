# Infrastructure

Pulumi program for the Lustre blocklist server on Hetzner Cloud.
Read [infrastructure memory](../../../.agents/memory/infrastructure.md) for the layout, deploy, backup, and restore steps.

| Project | Folder | Stacks | Owns |
| --- | --- | --- | --- |
| `lustre-platform` | `platform/` | `production` | Server, data volume, firewall, cloud-init (Docker, Tailscale, Caddy, Litestream, Compose) |

## Layout

```text
platform/
  Pulumi.yaml             project; runs index.ts through tsx (TypeScript 7)
  Pulumi.production.yaml  stack values without secrets
  config.ts               reads and validates the stack values
  host.ts                 cloud-init, compose.yaml, Caddyfile, litestream.yml, deploy.sh
  index.ts                resources and outputs
```

Infrastructure code imports no workspace code. Biome rejects `@lustre/*` imports in this package.

## Checks

```sh
pnpm --filter @lustre/infra typecheck
pnpm exec vitest run src/packages/infra
```

The tests read the config with Pulumi mocks and render the host files. They create no resource.

## First setup (owner)

Nothing below has run yet. Do it once, in this order.

1. Create a Hetzner Cloud project and an API token (read and write). Store it as the GitHub secret `HCLOUD_TOKEN`.
2. In Hetzner Object Storage, create two private buckets in a location other than the server (for example `nbg1`): one for Pulumi state, one for Litestream. Create an S3 key for each, scoped to its bucket if possible.
3. Choose the domain of the API. Set `acmeEmail` if Let's Encrypt should send notices.
4. Create a reusable, pre-approved Tailscale auth key with the tag `tag:lustre`, and an OAuth client (scope `auth_keys`, tag `tag:ci`) for GitHub Actions. Add the SSH rule for `tag:ci` and the owner to the tailnet policy (see infrastructure memory).
5. Log in to the state backend and create the stack. The passphrase encrypts the stack secrets; keep it in the password manager and as the GitHub secret `PULUMI_CONFIG_PASSPHRASE`.

   ```sh
   cd src/packages/infra/platform
   export AWS_ACCESS_KEY_ID=<state key> AWS_SECRET_ACCESS_KEY=<state secret>
   pulumi login 's3://<state bucket>?endpoint=nbg1.your-objectstorage.com&region=nbg1'
   pulumi stack init production --secrets-provider passphrase
   pulumi config set domain <domain>
   pulumi config set --secret tailscaleAuthKey <tskey-auth-...>
   pulumi config set --secret backupBucket <litestream bucket>
   pulumi config set --secret backupAccessKeyId <key>
   pulumi config set --secret backupSecretAccessKey <secret>
   HCLOUD_TOKEN=<token> pulumi preview --stack production
   ```

   `stack init` adds `encryptionsalt` to `Pulumi.production.yaml`. Commit the file: it then holds only encrypted secrets.
6. Run `pulumi up`, or the `Deploy infra` workflow. Point the A and AAAA records of the domain to the outputs `ipv4Address` and `ipv6Address`.
7. Run the `Deploy server` workflow once, then make the GHCR package `lustre-server` public, so a new host can pull `latest` without a login.

Do not create a second stack because the expected one is missing. Check the backend URL and the passphrase first.
Never commit a plain secret.
