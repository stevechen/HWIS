# 10: Per-type behavior (exam multi-day, partial, targets)

**What to build:** Start: prefilled `Start at P3`, not editable; class outside window renders `No class`. Partial: day + period range; matching periods show title+note, non-matching show note only ("class as usual"). Exam: start date → auto-generate consecutive teaching days past weekends/offs (2 for Exam 1/2, 3 for Final); each day own event row sharing `examGroup`; off colliding with exam day refuses; 4th exam group refuses. Targets: `All, CLIL, Comm, G7, G8, G9, H1` with per-type gating per CSV (Quiz→CLIL, Passport/Recording→Comm, G9 Mock→G9, exams/No-School/No-class→All locked; Start/Partial/Task→dropdown).

**Blocked by:** 09-event-form-note-visibility

**Status:** ready-for-agent

- [ ] Start of School: prefilled `Start at P3`, not editable; class outside semester window renders `No class` in list+calendar
- [ ] Partial: day + period range; matching periods show title+note, non-matching show note only ("class as usual")
- [ ] Exam: start date → auto-generate consecutive teaching days pushing past weekends/offs (2 for Exam 1/2, 3 for Final)
- [ ] Each exam day = own event row sharing `examGroup`
- [ ] Creating `off` colliding with exam day → refused
- [ ] 4th exam group → refused
- [ ] Targets extended to `All, CLIL, Comm, G7, G8, G9, H1`
- [ ] Per-type target gating:
  - Quiz → CLIL only
  - Passport/Recording due → Comm only
  - G9 Mock → G9 only
  - Exams/No-School/No-class → All (locked)
  - Start/Partial/Task → dropdown
