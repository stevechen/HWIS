## Why

Teachers recording lesson notes on the ESL calendar currently edit through a small two-line textarea directly on the day card. This cramps longer lesson plans, risks losing unsaved text during class navigation, and lacks rich formatting for lesson outlines, vocabulary lists, or links.

## What Changes

- Remove the inline textarea from calendar meeting cards. Replace it with a clickable Markdown preview clamped to 2 to 3 lines, or a clickable "+ Add lesson note" placeholder when blank.
- Open a dedicated modal dialog upon clicking the note area. The dialog provides a Markdown WYSIWYG editor that supports both visual toolbar actions and Markdown typing shortcuts (such as `# `, `- `, `1. `, and `**text**`).
- Display meeting context in the dialog header: class name, date, and weekday. Exclude period numbers.
- Add explicit "Save Note" and "Cancel" buttons to the dialog. Support `Cmd+Enter` and `Ctrl+Enter` to save, and `Escape` to close with an unsaved changes confirmation.
- Saving empty text deletes the note from the database, preventing blank records.
- Preserve private note access. Notes remain keyed by `(classId, teacherId, date)` and accessible only to the assigned teacher.
- Raise `MAX_NOTE_LENGTH` in `src/convex/esl/notes.ts` from 2,000 to 10,000 characters.

## Capabilities

### New Capabilities

- `lesson-notes-editor`: Modal dialog and rich Markdown WYSIWYG editor for ESL class meeting notes, with keyboard shortcuts and live Markdown formatting rules.

### Modified Capabilities

- `esl-notes-storage`: Raise note character capacity from 2,000 to 10,000 characters while preserving assigned teacher access checks and empty note removal.

## Impact

- `src/convex/esl/notes.ts`: Raise `MAX_NOTE_LENGTH` to 10,000 characters.
- `src/routes/esl/schedule/calendar/TeacherCalendar.svelte`: Replace textarea with clamped note preview and dialog opener.
- `src/routes/esl/schedule/calendar/+page.svelte`: Wire note saving and deletion through the dialog workflow.
- `src/lib/components/esl/LessonNoteDialog.svelte`: New component hosting the dialog, editor, toolbar, and shortcuts.
- Dependencies: TipTap core and Markdown extension compatible with Svelte 5.
