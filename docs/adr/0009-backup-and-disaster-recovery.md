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

## Implementation & Consequences

### Implementation

- `src/convex/shared/backup_snapshot.ts`: Builds standardized JSON snapshots of the entire application dataset.
- `src/convex/backup.ts`: Implements snapshot exports (`exportData`), creation (`createBackup`), listing (`listBackups`), deletion (`deleteBackup`), and complete restoration (`restoreBackup` / `restoreFromBackupPayload`).
- `src/convex/driveBackup.ts`: Node.js action that packages database snapshots and uploads them to Google Drive via the Google Drive REST API.

### Consequences

- **Instant Rollback**: Admins can roll back to a known snapshot in seconds before or after major system changes.
- **Automated Off-site Disaster Recovery**: Daily off-site Google Drive backups guarantee data recovery even in the event of database platform outage or region failure.
- **Migration Safety**: Destructive operations like year-end grade migrations automatically capture snapshots, preventing accidental data loss during annual rollovers.
