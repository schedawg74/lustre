#!/bin/sh
# Copies the stack secrets from 1Password into the encrypted config of the
# `production` stack (Pulumi.production.yaml). Run it after a secret changes in
# 1Password, then commit Pulumi.production.yaml. A changed secret changes the
# user data, so the next `pulumi up` replaces the server.
#
#   src/packages/infra/scripts/sync-secrets.sh
#
# Needs `op` (signed in) and `pulumi`. The values go to Pulumi through stdin,
# never as command arguments.
set -eu

platform="$(cd "$(dirname "$0")/../platform" && pwd)"
cd "$platform"

if [ -z "${OP_SYNC_RUNNING:-}" ]; then
  OP_SYNC_RUNNING=1 exec op run --env-file=.env.production.1password -- "$0"
fi

set_secret() {
  [ -n "$2" ] || {
    echo "The 1Password reference for $1 is empty" >&2
    exit 1
  }
  printf '%s' "$2" | pulumi config set --stack production --secret "$1"
  echo "Set $1"
}

set_secret tailscaleAuthKey "$STACK_TAILSCALE_AUTH_KEY"
set_secret backupBucket "$STACK_BACKUP_BUCKET"
set_secret backupAccessKeyId "$STACK_BACKUP_ACCESS_KEY_ID"
set_secret backupSecretAccessKey "$STACK_BACKUP_SECRET_ACCESS_KEY"
