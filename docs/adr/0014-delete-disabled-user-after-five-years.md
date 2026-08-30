# ADR-0014: Delete Disabled User After Five Years

## Status

Accepted

## Context

The accreditation bodies (IB, WASC) require records kept for five years. A user who has been
disabled (`status: 'pending'` with a `deactivatedAt` timestamp) for five years no longer needs
to be recoverable. Admins want a way to permanently remove such an account.

The `users` row holds `authId` — the underlying Better Auth user id. Deleting just the Convex
row is not a true deletion: the Better Auth `account` (the Google link) would remain, so the
person's next Google login would recreate a fresh `users` row (as `pending`). To delete for
real, the linked auth account must go too.

This interacts with the restore rules already set in ADR-0012/0013: absence is the deletion
marker, and restore never resurrects a deleted user.

## Decision

**Binary Auth option chosen: true deletion.**

1. **Delete both the Convex `users` row and the linked Better Auth account.** The removal uses
   the auth-component adapter (`authComponent.adapter(ctx)`, the established seam used by
   `dedupeUsers`, `recoverAuth`, `createUser`), deleting the `account`/`session` records keyed by
   the user's `authId`. This makes the deletion permanent — no login resurrection.
2. **Delete eligibility is gated on `deactivatedAt` age:** the action is only available when
   `deactivatedAt` is set and `deactivatedAt < now - 5 years`. The schema already tracks
   `deactivatedAt`; no new state field is needed.
3. **References are left untouched.** `classes.homeroomTeacherId` and `evaluations.teacherId`
   are not scrubbed; the system already treats a missing user as deleted/"Unknown Teacher" (per
   ADR-0012 absence rule and ADR-0013 no-resurrection). This avoids a destructive cascade.
4. **Restore never resurrects them** (already ADR-0012): a deleted user absent from live is
   skipped at restore, and dependent evaluations are skipped.

## Consequences

- Deleted accounts cannot re-enter the system via login — the Google link is removed.
- Old evaluations/classes referencing a deleted user render as "Unknown Teacher" rather than
  erroring.
- The 5-year gate respects the accreditation requirement: nothing is destructively deleted
  before the retention obligation has elapsed.
- Requires the auth adapter cleanup step (more than a plain row delete), but reuses an existing
  seam rather than new infrastructure.
