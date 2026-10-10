# 12: Even/odd unit + quiz draft generation

**What to build:** Even units = exact 7 calendar days `examStart−7d … examStart−1d` (no weekend shifting; views naturally ignore non-teaching days). Odd units = Mon–Fri week containing the median class meeting of the term's class count (`start→exam1` / `exam1→exam2`). Quiz = 6/semester (S1 = U1–6, S2 = U7–12), range collapsing to last-match-date per old rules, fixed title `Quiz`. Rare skipped unit → admin edits titles to shift forward. Class-day counting excludes `Off`/`No class`-titled days + partial non-matching periods + out-of-window Start rows.

**Blocked by:** 07-semester-end-date-defaults, 10-event-type-behavior

**Status:** ready-for-agent

- [ ] Even units: exact 7 calendar days `examStart−7d … examStart−1d` (no weekend shifting)
- [ ] Odd units: Mon–Fri week containing median class meeting of term's class count
- [ ] Quiz: 6/semester (S1 = U1–6, S2 = U7–12), range collapsing to last-match-date
- [ ] Quiz title fixed as `Quiz`; skipped unit → admin edits titles to shift forward
- [ ] Class-day counting excludes: `Off`/`No class`-titled days, partial non-matching periods, out-of-window Start rows
- [ ] Duration ≥ 1 week for all generated drafts
