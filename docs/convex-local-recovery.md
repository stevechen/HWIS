# Local Convex Recovery Runbook

Use this when local Convex fails with errors like:

- `Local backend did not start on port 3210 within 30 seconds`
- `DeploymentNotFound ... local-...bak...`
- Better Auth errors in local (`SITE_URL`, `BETTER_AUTH_SECRET`, Google client vars missing)

## One-Command Recovery

```bash
bun run convex:local:recover
```

This script does all of the repetitive cleanup work:

- Backs up the current local backend state directory to `~/.convex/backups/`
- Moves any invalid backup-named deployment directories out of `~/.convex/convex-backend-state/`
- Comments out stale `CONVEX_DEPLOYMENT=` in `.env.local`

## Recreate Local Deployment

After the recovery script:

```bash
bunx convex dev --configure existing --typecheck=disable
```

Choose:

- Project: `hwis-31a3d`
- Deployment type: `local deployment (BETA)`

## Sync Required Local Convex Env Vars

Keep `convex dev` running, open a second terminal, then run:

```bash
bun run convex:local:env-sync
```

This sets the local deployment env vars needed for Better Auth login and for the
local backup path:

- `SITE_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CRON_SECRET` (guards `exportDataForCron`; previously unmanaged locally)
- `GOOGLE_DRIVE_FOLDER_ID` — read from `LOCAL_GOOGLE_DRIVE_FOLDER_ID`, **not**
  from `GOOGLE_DRIVE_FOLDER_ID`
- `ALLOW_NONPROD_DRIVE_BACKUP` — set to `true` only alongside a scratch folder

Values are read from `.env.local`, then `.env` as fallback.

`GOOGLE_REFRESH_TOKEN` is deliberately **not** synced. It is a long-lived
credential, and copying it here is how a local cron run came to write into the
production Drive backup folder. A local deployment that does not set
`ALLOW_NONPROD_DRIVE_BACKUP=true` skips the Drive upload with a logged reason and
still writes its database row, so nothing local is lost. See
`docs/drive-backup-targets.md` for the full per-deployment source of truth.

If the local backend logs a Drive failure like `invalid_grant`, that is the shared
prod refresh token being rejected — it is dead and must be re-minted on the prod
deployment. The guard means local no longer depends on it.

## If Users Exist in Better Auth but Not in app `users`

Rebuild app profiles from Better Auth users:

```bash
bunx convex run recoverAuth:forceCreateUser '{"testToken":"unit-test-token"}'
```

If a specific user still needs explicit role/status:

```bash
# find Better Auth IDs
bunx convex run listUsers:listAllBAUsers '{"testToken":"unit-test-token"}'

# create/repair one profile (replace authId)
bunx convex run onboarding:createUserProfile '{"authId":"<AUTH_ID>","role":"teacher","status":"pending","testToken":"unit-test-token"}'
```

For owner/super account recovery:

```bash
bunx convex run onboarding:createUserProfile '{"authId":"<AUTH_ID>","role":"super","status":"active","testToken":"unit-test-token"}'
```

## Why This Reoccurs

Local deployments are still beta. Common triggers:

- local sqlite/wal state drift after crashes/sleep/wake
- stale local deployment metadata/name references
- backend version updates against old local state
- local deployment env not persisted (different from app `.env.local`)

## Stable Alternative

If local beta interruptions are too frequent, switch to cloud dev:

```bash
npx convex disable-local-deployments
bunx convex dev --configure existing --typecheck=disable
```

Then pick your `dev:...` deployment.
