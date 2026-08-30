# ADR-0013: Backup Schema Versioning & Restore Compatibility

## Status

Accepted

## Context

Backups serialize a projection of the current database schema (see ADR-0009 for the snapshot
shape). If the schema changes in a **breaking** way (a field renamed, a table removed, a union
member dropped), an older snapshot no longer satisfies the current table validators and cannot
be restored as-is. The question is how far to go to keep old backups restorable.

This intersects with ADR-0012's retention model: only the **restorable window** (~1 year, hot
archive) is meant to be restored; the cold archive (5-year records) is kept but not intended for
restore. So the schema-migration problem only really spans the restorable window.

## Decision

**Restore supports only the current schema shape; incompatible backups are flagged, not migrated.**

1. **No automatic migration framework.** We do not build a chain of `migrateSnapshotV(n→n+1)`
   utilities to bring arbitrary old snapshots forward. That would be speculative complexity for
   schema changes that haven't happened, and it conflicts with the tier-B decision that records
   past the restorable window are kept but not meant to be restored.
2. **Version marker is retained.** Snapshots carry `version` (currently `SNAPSHOT_VERSION = '1.0'`),
   present in both the DB `backups` payload and the Drive JSON file.
3. **Fail-fast at restore time.** On restore, the payload's `version` is checked against the
   current `SNAPSHOT_VERSION`. If there is no compatible migration path, restore is refused with
   a clear "incompatible schema version" error rather than attempting — and half-applying — a
   restore against the wrong shape.
4. **Forward migration only when actually needed.** If a specific breaking change _must_ be
   restorable, we write a one-off transformative step at that time, not proactively for
   hypothetical future changes.

## Consequences

- Restore is audited against the current shape and never silently mis-applies an old backup.
- The cost of a future breaking schema change is a conscious, one-time decision: either accept
  that older backups are no longer restorable (default, matching tier-B), or write a targeted
  forward migration for the ones that matter.
- No ongoing maintenance burden of keeping a general migration chain alive.
