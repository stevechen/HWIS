## Context

The ESL calendar (`/esl/schedule/calendar`) displays daily class meetings for assigned teachers. Currently, each card embeds a 2-line textarea bound directly to in-flight drafts. While functional for quick notes, it causes layout cramping, risk of loss when changing classes, and offers no rich formatting.

## Goals / Non-Goals

**Goals:**

- Replace inline textareas with a compact Markdown preview on cards.
- Add a modal dialog containing a Markdown WYSIWYG editor supporting both typing shortcuts and toolbar buttons.
- Display meeting context (Class, Date, Weekday) in the dialog header, omitting period number.
- Increase backend note capacity from 2,000 to 10,000 characters.
- Ensure blank text saves cleanly delete records.
- Support keyboard shortcuts (`Cmd+Enter` / `Ctrl+Enter` to save, `Escape` to close).

**Non-Goals:**

- Sharing notes across cohorts or other teachers (notes remain private to the assigned teacher of that class).
- Storing multiple notes per day or per period.
- Version history or diffing of past edits.

## Decisions

### 1. Dedicated modal dialog instead of inline expansion

- _Decision_: Open an edit dialog on click rather than expanding the card inline.
- _Rationale_: A calendar grid row height is fixed to match neighbouring days in that week. Expanding one card disrupts the grid layout. A modal dialog provides ample editing space regardless of note length.
- _Alternative considered_: Expandable inline card textarea. Rejected because it breaks row alignment and causes awkward vertical page shifts.

### 2. Markdown WYSIWYG editor with TipTap

- _Decision_: Use TipTap with Markdown extensions and `@tailwindcss/typography` styling.
- _Rationale_: TipTap works directly with Svelte 5 and supports both Markdown input rules (typing `# `, `- `, `**bold**`) and visual formatting buttons, giving both technical and non-technical teachers what they need.
- _Alternative considered_: Plain textarea with preview tab. Rejected because true inline WYSIWYG feels more direct.

### 3. Backend note length increase

- _Decision_: Raise `MAX_NOTE_LENGTH` from 2,000 to 10,000 characters in `src/convex/esl/notes.ts`.
- _Rationale_: 10,000 characters gives headroom for full lesson outlines, vocabulary lists, and links without meaningful impact on database storage.

## Risks / Trade-offs

- _[Unsaved edits when dismissing modal]_: Teachers might accidentally close the modal without saving.
  _Mitigation_: Check whether the draft differs from the original note and confirm before dismissing.
- _[Editor bundle weight]_: Adding an editor package could increase bundle size.
  _Mitigation_: Keep TipTap extensions limited to basic starter-kit essentials (bold, italic, list, heading, link).
