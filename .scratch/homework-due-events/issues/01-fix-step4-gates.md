# 01: Fix Step 4 event gates and shorter-week windows

**What to build:** `setRange()` and `armedGate()` in `Step4Panel.svelte` use `schoolWeekDates(snapped, skipSet)` (not `collectClassDays`) for all `pd*`/`rd*`/`pcheck`/`wcheck`; shorter windows (`≤3` school days) prepend previous full school week (`prevMonday` = `mondayOfWeek(snapped) - 7`); `straddleViolation` excluded unconditionally for these IDs; `snapClass` excluded for these IDs; block/order gates (`blockViolation`/`orderViolation`) enforced.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `setRange()` uses `schoolWeekDates` for `pd*`/`rd*`/`pcheck`/`wcheck`
- [ ] Shorter windows (`≤3`) prepend previous school week
- [ ] `straddleViolation` excluded for `pd*`/`rd*`/`pcheck`/`wcheck`
- [ ] Block/order gates enforced for all due/check events
