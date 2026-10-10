# 01: Restore canonical list columns with countdown logic

**What to build:** The teacher schedule list view shows `# | Date | Description | Note` columns exactly. The `#` column displays a remaining-count countdown per exam block (e.g., `18` → `0`, blank on `Off`/`No class`/`Exam` rows). Exam labels are `Exam 1`/`Exam 2`/`Final Exam`. TSV export matches display order with header `# Date Description Note`. Download filename includes class name.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Table header renders `# | Date | Description | Note` (no `Day` column, no `Class x/y to Exam z` text)
- [ ] Countdown column shows remaining classes per exam block, decreasing to `0` at last class before exam
- [ ] Countdown is blank on `Off`, `No class`, and `Exam` rows
- [ ] Countdown resets at each new exam block
- [ ] Exam rows render as `Exam 1` / `Exam 2` / `Final Exam` (renamed from generic `Exam`)
- [ ] Sort order remains oldest-first (current order unchanged)
- [ ] TSV download follows display order with header `# Date Description Note`
- [ ] Download filename includes class name (e.g., `2025-2026 S1 G7 Elementary 1 CLIL schedule.csv`)
- [ ] Calendar view strings unchanged — only `TeacherScheduleTable` + `esl-schedule-list` + list TSV touched
