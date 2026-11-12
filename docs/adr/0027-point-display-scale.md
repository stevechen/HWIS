# ADR-0027: Display evaluation points at 10×

## Status

Accepted

## Context

Evaluation values were stored as **+/-1** and **+/-2** and rendered at the same
scale everywhere. Teachers awarding points use the four fixed buttons; on a
large screen a +1/+2 spread reads as coarse, and the same four values look
almost identical on the house and class leaderboards once totals reach the
hundreds.

The stored quantities are also consumed by weekly reports, backups, audit rows,
and the year-end migration. Changing what is stored would mean a data migration
and would alter every historical report, so the display concern must not leak
into persistence.

## Decision

- Database documents and Convex queries keep canonical 1× values (**+/-1,
  +/-2**). No schema, validator, mutation, or query changes.
- Every UI surface renders points through `toDisplayPoints()` from
  `$lib/utils` (canonical × 10 → **+/-10, +/-20**).
- Forms accept points at display scale and convert on submit with
  `fromDisplayPoints()`; the stored value is always canonical. This covers the
  new-evaluation form, edit/batch dialogs, and the admin house-events inputs.
- Interactive test IDs stay canonical (`point-1`, `point-2`, `point--1`,
  `point--2`) so e2e page objects and existing automation keep working; only
  the visible label and ARIA text scale.
- Weekly reports are the single exception: the admin page, its detail dialog,
  and the CSV export stay canonical 1× because they are a record of what was
  stored.
- Ratios and geometry (score-tally bar widths, radar radii, `flex-grow`
  allocations, glow strength) use raw canonical values. The multiplier cancels
  in a quotient, so proportions and rankings are unchanged.

## Consequences

- One source of truth for the multiplier (`POINTS_MULTIPLIER`); new surfaces
  must call the helpers instead of hardcoding ×10.
- No migration and no change to historical reports, backups, or snapshots.
- `toDisplayPoints` rounds to 12 significant digits at display time so
  fractional house-event values (e.g. typing `5.3`, stored as `0.53`) render
  without binary-float noise.
- A surface that forgets to convert is a visible 1×/10× inconsistency; the
  helpers and the ADR exist to make that mistake obvious in review.
