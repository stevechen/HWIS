# 08: New event type union + banner model (title + note separation)

**What to build:** Schema `esl_events.type` union becomes `start_school, quiz, no_school(=off), no_class, partial, exam, passport_due, recording_due, task (unified), g9_mock`. `homework_due` deleted (migrate existing rows → `task`). Every event has explicit `title` (chip text) + separate `note` (detail line) — never derived from each other. Fixed titles locked per type; only Task takes free-text title.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `esl_events.type` union updated to 10 types:
  - `start_school`, `quiz`, `no_school`, `no_class`, `partial`, `exam`, `passport_due`, `recording_due`, `task`, `g9_mock`
- [ ] `homework_due` removed; existing rows migrated to `task`
- [ ] Every event row has explicit `title` (banner/chip text) + separate `note` (detail)
- [ ] `title` and `note` never derived from each other
- [ ] Fixed titles locked per type:
  - `Start of School` → `Start at P3`
  - `Quiz` → `Quiz`
  - `No School` → `Off`
  - `No class` → `No class`
  - `Partial` → `No class`
  - `Exam` → dropdown `Exam 1 / Exam 2 / Final Exam`
  - `Passport due` / `Recording due` → locked labels
  - `G9 Mock` → `G9 Mock Exam`
  - `Task` → free-text title (required, always the banner)
