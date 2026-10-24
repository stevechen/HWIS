## 1. Backend Note Capacity

- [ ] 1.1 Update `MAX_NOTE_LENGTH` to 10,000 in `src/convex/esl/notes.ts` and adjust unit tests in `src/convex/esl/notes.test.ts`
- [ ] 1.2 Verify backend unit tests pass with `bun run test:unit:convex`

## 2. Editor and Dialog Component

- [ ] 2.1 Add required editor and markdown rendering dependencies
- [ ] 2.2 Create `src/lib/components/esl/LessonNoteDialog.svelte` with meeting header context, rich editor toolbar, and shortcut listeners (`Cmd+Enter`, `Escape`)

## 3. Calendar Integration

- [ ] 3.1 Update `TeacherCalendar.svelte` to remove inline textarea and render clamped Markdown preview or "+ Add lesson note" button
- [ ] 3.2 Connect card note click to open `LessonNoteDialog` with meeting details
- [ ] 3.3 Wire note save and delete callbacks in `src/routes/esl/schedule/calendar/+page.svelte`

## 4. Verification

- [ ] 4.1 Verify calendar component tests and typecheck pass with `bun run check` and `bun run test:component`
