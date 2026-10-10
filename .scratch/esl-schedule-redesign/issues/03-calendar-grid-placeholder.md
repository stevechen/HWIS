# 03: Dynamic week grid columns + `Note…` placeholder

**What to build:** The calendar view week grid uses dynamic columns: `min(cards-in-week, 3)` — 1 card → 1 column, 2 cards → 2 full-width columns, 3+ cards → 3 columns. Mobile still stacks. Note textarea placeholder is exactly `Note…` (capital N + U+2026) with `aria-label="Note for {date}"`.

**Blocked by:** 02-calendar-short-label

**Status:** ready-for-agent

- [ ] Week grid columns = `min(cards-in-week, 3)` (1→1, 2→2 full-width, 3+→3)
- [ ] Mobile viewport still stacks cards vertically
- [ ] Note textarea placeholder = `Note…` (capital N + U+2026 ellipsis)
- [ ] `aria-label="Note for {date}"` preserved on textarea
- [ ] No changes to `calendar-weeks` / `TeacherCalendar` text beyond these two items
