# ADR-0026: Drive Backup Environment Targeting

## Status

Accepted

## Context

The daily Drive backup cron (`crons.daily('daily-drive-backup', …,
internal.driveBackup.scheduledBackup)`) is registered unconditionally on every
deployment, and non-prod deployments held the same Google OAuth credentials and
the same `GOOGLE_DRIVE_FOLDER_ID` as production.

Because Drive permits duplicate filenames, a local or dev cron run did not
overwrite the production archive — it added a second `backup-YYYY-MM-DD.json`
beside the real one. During an incident, "which of these two files is the
production backup?" became a guess. The failure was invisible: nothing errored,
and the extra file looked exactly like the artefact it was impersonating.

A second, independent mechanism had the same shape. E2E tests legitimately
created rows in the `backups` table through the admin Force Backup path, but that
path never set the `e2eTag` field, so those rows were invisible to
`deleteBackupsByTag` and to `verifyCleanTeardown`. The only teardown that reached
them was `teardownBackupsByTimestamp`, a time window — protection by convention
rather than by structure.

Three options were considered:

- **A. Separate Drive targets per environment.** Prod keeps its folder; every
  non-prod deployment gets its own. Nothing is ever skipped, so the upload path
  stays exercised everywhere.
- **B. Skip uploads off prod.** `scheduledBackup` no-ops outside production.
  Cheapest, but the off-prod upload path then goes unverified everywhere except
  prod.
- **C. Both.** A on the Drive side, plus tag hygiene in the database.

## Decision

**C.**

**Drive side.** A single guard inside `uploadSnapshotBackup` — the one function
that reaches Drive, shared by the cron and the manual admin action, so no new
caller can bypass it. Off production the upload is refused unless the deployment
sets `ALLOW_NONPROD_DRIVE_BACKUP=true` _and_ holds a `GOOGLE_DRIVE_FOLDER_ID` of
its own; prod uploads unconditionally. Opting in without a folder is refused too,
because an opt-in that inherits prod's folder is the exact failure being fixed.

Independently of the guard, every filename carries its environment:
`backup-<env>-YYYY-MM-DD.json`, on prod as well. The guard prevents the
misconfiguration; the filename makes any future recurrence legible without opening
the file. A bare `backup-YYYY-MM-DD.json` no longer exists on any deployment.

A refused upload is **reported, not thrown**. The in-database `backups` row is
written on every deployment regardless — it is the hot archive the admin UI reads
— and a cron that threw on every non-prod run would bury real failures in noise.

**Database side.** `e2eTag` is threaded through the admin Force Backup path and
through the pre-restore safety snapshot, the two rows that page creates, by
reading an `?e2eTag=` query parameter. This is the same seam the ESL roster
import already used, and it is now a shared helper (`src/lib/e2e-tag.ts`) rather
than a per-component copy. The tag is absent from every real visit, so
production backups stay untagged and invisible to tag-based teardown.

`teardownBackupsByTimestamp` is kept as a safety net. It is no longer the only
mechanism covering the `backups` table, which was the point.

## Consequences

- A non-prod backup run can no longer land a same-name file in the production
  Drive folder, and the filename makes any bypass visible rather than silent.
- The off-prod upload path is still exercisable: set the opt-in and a scratch
  folder. Coverage is not traded away for safety.
- Prod behaviour changes only by the filename prefix. The `source` vocabulary
  (ADR-0009), retention (ADR-0012), and restore permissions are untouched, and
  `restoreFromBackup` remains admin-only on every deployment.
- A deployment that is misconfigured for Drive now fails quietly by design
  (skipped + logged) rather than loudly. Prod is the exception: it still throws on
  missing credentials, because a silent skip there would mean a silently
  unarchived year.
- `GOOGLE_REFRESH_TOKEN` must not be copied to a machine running untrusted code.
  `scripts/convex-local-env-sync.sh` never syncs it, and reads the Drive folder
  from a `LOCAL_`-prefixed key so an app `.env` pointing at the production folder
  cannot leak in through the script. The per-deployment source of truth is
  documented in `docs/drive-backup-targets.md`, including how to re-mint the
  prod token and how to verify a replacement actually reaches Drive.

- There is a **second** Drive upload path, `src/routes/api/cron-backup/+server.ts`,
  which reads the Google vars from the Vercel env rather than the Convex env. It
  calls the same policy and so cannot reintroduce the un-prefixed filename, but it
  declares its environment with `BACKUP_DEPLOYMENT` (a Vercel function has no
  `CONVEX_DEPLOYMENT`) and refuses when that is unset. Nothing schedules it today.

## Alternatives not taken

- **A alone** leaves test-created `backups` rows invisible to tag-based teardown.
- **B alone** means the off-prod upload path is never exercised, so a regression
  in it would surface only in production — the one place it matters most.
- **A per-environment service account** (a second token with no access to the
  prod folder) is stronger than the folder-id check, and worth adding if the
  backup surface grows. It was left out because it requires minting and
  maintaining a second credential, which is operational work rather than a code
  change.
