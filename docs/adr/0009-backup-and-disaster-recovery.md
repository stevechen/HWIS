# ADR-0009: Backup and Disaster Recovery

## Status

Accepted

## Context

The CAS point system holds critical academic and behavioral evaluation records, student profiles, and configuration settings. Protection against accidental data loss, invalid admin operations, failed migrations, and platform catastrophic failures is essential.

## Decision

The system implements a two-tier backup and recovery strategy combining rapid in-database snapshots with automated off-site cloud storage.

1. **In-Database Snapshots**:
   - The `backups` table stores complete JSON snapshot exports of key application tables (`students`, `evaluations`, `users`, `point_categories`, `classes`, `house_events`).
   - Snapshots can be generated on-demand by administrators or automatically generated prior to destructive operations (such as the year-end grade advancement in `advanceGradesAndClearEvaluations`).
2. **Automated Off-site Backups**:
   - A daily Vercel cron job triggers the Convex Node.js action in `src/convex/driveBackup.ts`.
   - The action authenticates via Google OAuth refresh tokens (`GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and uploads dated database snapshot files directly to a designated Google Drive folder (`GOOGLE_DRIVE_FOLDER_ID`).
3. **Restoration Mechanism**:
   - Database state can be fully restored via the `backup.restoreBackup` (or `backup.restoreFromBackupPayload`) mutation, which validates payload structures, handles record re-insertion, and skips invalid or orphan references gracefully.

## Ownership & Permissions Model

Backups are owned and attributed so administrators can reason about who created each snapshot and what they are allowed to do with it.

### Ownership Metadata

Each row in the `backups` table carries:

- `name` (optional string): the human-readable display name. If omitted, `insertBackupRecord` derives a timestamped default (e.g. `Manual Backup - 2026-...`, `Year-End Migration Snapshot - ...`, `Pre-Restore Safety Snapshot - ...`, `Scheduled Auto Backup - ...`).
- `creatorId` / `creatorName` / `creatorRole`: the user who triggered the backup. `creatorRole` is one of `super` | `admin` | `teacher` | `student` and drives badge rendering.
- `source`: one of `manual` (admin-triggered), `system_migration` (year-end grade advancement), `system_safety` (pre-restore payload verification), or `system_cron` (scheduled auto backup). System snapshots have no `creatorId`.

### Download Scoping

- **Super Admin** may download any backup.
- **Admin** may download backups they own and all system auto-backups.
- **Admin may NOT download another admin's `manual` backup.** The Download button is hidden in the UI (`canDownloadBackup`), and the chunk query `getBackupChunk` rejects unauthorized callers with `Forbidden`.
- The downloaded `.json` filename is the sanitized form of `backup.name || backup.filename` (non `a-zA-Z0-9-_.` characters become `_`).

### Restoration (Unrestricted)

- Any active Administrator or Super Admin may restore from **any** backup in history (`restoreFromBackup`) or from an uploaded file (`restoreFromBackupPayload`). Restoration is intentionally not scoped by ownership — it is a recovery operation available to all staff with admin area access.

### Enforcement Location

- `src/convex/shared/authorization.ts`: `canDownloadBackup`, `canRenameBackup`, `canDeleteBackup`, `isSystemBackup` are the single source of truth for backup permissions, mirrored by the same predicates in the admin UI.
- `src/convex/shared/backup_snapshot.ts`: `insertBackupRecord` applies default names, stamps creator/source metadata, and chunks oversized payloads.
- `src/convex/backup.ts`: mutations (`createBackup`, `renameBackup`, `deleteBackup`, `getBackupChunk`) and queries (`listBackups`) enforce the model; `restoreFromBackup` / `restoreFromBackupPayload` apply the unrestricted policy.

## Implementation & Consequences

### Implementation

- `src/convex/shared/backup_snapshot.ts`: Builds standardized JSON snapshots of the entire application dataset.
- `src/convex/backup.ts`: Implements snapshot exports (`exportData`), creation (`createBackup`), listing (`listBackups`), deletion (`deleteBackup`), chunk retrieval (`getBackupChunk`), and complete restoration (`restoreBackup` / `restoreFromBackupPayload`).
- `src/convex/driveBackup.ts`: Node.js action that packages database snapshots and uploads them to Google Drive via the Google Drive REST API.
- `src/lib/utils/backup.ts`: `sanitizeFilename` produces the on-disk download name from the backup display name.

### Consequences

- **Instant Rollback**: Admins can roll back to a known snapshot in seconds before or after major system changes.
- **Automated Off-site Disaster Recovery**: Daily off-site Google Drive backups guarantee data recovery even in the event of database platform outage or region failure.
- **Migration Safety**: Destructive operations like year-end grade migrations automatically capture snapshots, preventing accidental data loss during annual rollovers.
- **Clear Attribution**: Ownership metadata and role-prefixed badges make it obvious who created each snapshot and why (manual vs. system).
- **Safe Sharing of System Snapshots**: All admins can read system auto-backups, but only Super Admins (or the owner) can mutate or remove a backup.
