## ADDED Requirements

### Requirement: Clickable note preview on meeting cards

The ESL calendar card SHALL display a compact, clamped Markdown summary of the meeting note instead of an interactive textarea.

#### Scenario: Existing note displays clamped preview

- **WHEN** a meeting row has an existing note
- **THEN** the card renders the note text formatted as Markdown clamped to 2 to 3 lines

#### Scenario: Empty note displays placeholder trigger

- **WHEN** a meeting row has no note recorded
- **THEN** the card renders a clickable "+ Add lesson note" placeholder button

#### Scenario: Off and no-class days exclude note trigger

- **WHEN** a calendar card has status "off" or "no_class"
- **THEN** no note preview or placeholder button is rendered on the card

### Requirement: Modal dialog for editing lesson notes

Clicking the note preview or placeholder button SHALL open a modal dialog for composing and editing meeting notes.

#### Scenario: Opening note dialog

- **WHEN** the teacher clicks the note preview or "+ Add lesson note" placeholder
- **THEN** a modal dialog opens showing the class name, date, and weekday in the header, excluding the period number

#### Scenario: WYSIWYG and Markdown input rules

- **WHEN** the teacher types in the editor
- **THEN** formatting can be applied through the visual toolbar (bold, italic, lists, headings) or typed as Markdown shortcuts (`# `, `- `, `1. `, `**text**`)

#### Scenario: Saving a note

- **WHEN** the teacher clicks "Save Note" or presses `Cmd+Enter` / `Ctrl+Enter`
- **THEN** the note text is saved to Convex and the dialog closes

#### Scenario: Canceling without saving

- **WHEN** the teacher clicks "Cancel" or presses `Escape` with unsaved changes
- **THEN** a confirmation prompt guards against accidental dismissal before closing
