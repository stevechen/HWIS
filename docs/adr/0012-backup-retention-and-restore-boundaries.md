# ADR-0012: Backup Retention, Restore Boundaries & Hybrid Hot/Cold Archive

## Status

Accepted — supersedes ADR-0009 for the backup/restore strategy this decision covers. The schema
compatibility policy is ADR-0013.

## Context

The school's accreditation bodies (IB, WASC) require academic and behavioral records to be
kept for **five years**. Backups must therefore serve two distinct purposes that pull in
opposite directions on retention:

- **Emergency restore (tier A)**: rolling back recent mistakes — "oops, I deleted/edited
  something in the last week". Needs recent, fast, in-app restore only (≈ a month).
- **5-year records (tier B)**: the certification-required archive. Needs to be kept for 5
  years, but never needs to be _restored_.

The current backup system (ADR-0009) keeps snapshots indefinitely in the `backups` table with
unrestricted restore, and uploads a daily file to Google Drive. Two problems motivate this
revision: the Drive path is not functioning (missing `GOOGLE_REFRESH_TOKEN`), and keeping
5 years of full snapshots in Convex would consume a large and growing share of the 3 GB database
storage quota — the very reason Drive was originally chosen.

## Decision

**Retention is the mechanism; we prune by age rather than gate restore by age.** A scheduled
retention job deletes snapshots past their tier's window from both the `backups` table and the
Google Drive folder. Because everything past a window is pruned, an age check at restore time is
unnecessary. The retention job runs **once per day**, matching the daily backup cadence, so
storage stays bounded.

**Tiers:**

- **Hot archive (Convex `backups` table)** — _restorable_:
  - Daily snapshot for ~1 month.
  - One monthly snapshot kept for ~12 months (rolling).
  - `system_safety` snapshots kept ~3 months so a bad restore stays recoverable past the daily
    window.
  - Bounded storage (~1 GB), which is the restorable surface.
- **Cold archive (Google Drive)** — _kept, not restorable in the normal path_:
  - The perpetual 5-year `system_migration` (year-end) snapshots, per the accreditation
    requirement.
  - Older monthly points roll off the hot archive onto Drive.
  - Lives off the Convex DB, preserving quota.

**Hybrid, not all-DB:** the 5-year archive must not live in the `backups` table (storage
growth); it lives on Drive. This preserves the quota-avoidance rationale behind the original
Drive design.

**Restore must respect deletion:** restore **never resurrects a deleted user**. A user absent
from the live `users` table (matched by `authId`) is treated as deleted and skipped; dependent
evaluations referencing them are skipped via the existing `skippedEvaluations` machinery.
Deletion is final with respect to restore — absence is the deletion marker, so no tombstone
column is needed.

**System Backups calendar:** the backup admin UI splits `Backup History` into a list tab
(manual + `system_migration`) and a calendar tab for system auto-backups (one daily snapshot per
day, most-recent-wins). Clicking a day restores that snapshot; restore first triggers a
`system_safety` snapshot so a bad restore is undoable.

**Drive snapshot parity:** the Drive payload is extended to include `classes` and `houseEvents`
(currently omitted) so the cold archive is a complete snapshot. Both the DB and Drive paths now
serialize the single `buildSnapshot` shape, guaranteed by a parity test
(`src/convex/driveBackup.test.ts`). **Implemented.**

**Schema evolution:** restore supports only the current schema shape; older backups that no
longer match are flagged and kept, not auto-migrated. See ADR-0013.

## Consequences

- A destructive change (delete user, corrupt data) within ~1 month is recoverable in-app; older
  restoration requires the cold archive on Drive.
- Deleted users stay deleted after restore (no resurrection of deliberately-removed accounts).
- Convex storage stays bounded and comfortable instead of growing toward the 3 GB quota.
- Requires `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID`, and `CRON_SECRET` to be configured
  as Convex deployment env vars for the Drive cold archive to function.
- The current cron writes _only_ to Drive and never inserts a `backups` row; a second daily job
  that writes the hot-archive row must be added for the calendar tab to have data. **Drive remains
  in scope as the cold archive** — it is not optional, because the 5-year records cannot live in
  Convex without consuming the storage quota.
- Older `system_migration` snapshots are the only perpetual records; everything else is pruned by
  age.
