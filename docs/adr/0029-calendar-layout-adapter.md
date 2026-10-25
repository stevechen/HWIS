# ADR-0029: Calendar Layout Adapter (Candidate 2 Deepening)

## Status

Accepted — with interface sketch pending; adapter module to be extracted from `TeacherCalendar.svelte`.

## Context

The `TeacherCalendar.svelte` component (ESL schedule calendar, ticket #196) has a tiny props interface (`CalendarClassOption[]`, selected class, fragments, notes) but a 400+ line implementation mixing sticky toolbar rendering, CSS anchor-based menu state, scroll-to-week (`document.getElementById` + `scrollIntoView`), month-divider math (`monthDividerClass`), and note-dialog interaction. The pure geometry module `calendar-weeks.ts` is already deep; the friction is at the presentation layer — no adapter separates layout mechanics from the presentational shell.

## Decision

Split `TeacherCalendar.svelte` into a deepened module with a real seam:

- **Adapter module** (`CalendarLayout` adapter, proposed under `src/lib/components/esl/calendar-layout/`): owns sticky toolbar geometry, class-menu state (not user interaction — just open/close/selection events), scroll-to-week, and month-boundary computation. It exposes `layoutProps` (derived from fragments + selected) and `layoutEvents` (onSelectClass, scrollToWeek). The adapter stays pure — no `document` access; it emits `targetWeek` for scroll, and the shell executes it.
- **Shell component** (`TeacherCalendar.svelte`): keeps props interface, note-dialog state (`dialogOpen`, `dialogDate`), `onSaveNote`, and all user-facing events. It delegates layout to the adapter.
- **Seam**: `CalendarLayout` is a hypothetical adapter today (one adapter = layout); it becomes a real adapter once mobile/print layout is added.

Test change: adapter gets independent unit tests (`tests/lib/components/esl/calendar-layout/`); component tests thin to structural assertions on props + events only.

## Implementation

Not yet implemented. Proposed adapter interface to sketch in next step:

- Input: `CalendarLayoutProps` (derived from current component props: `classes`, `selectedClassId`, `fragments`, `nextDate`, `today`)
- Output: layout state objects (`currentWeek`, `allWeekdays`, `showTodayButton`) and layout events emitted back to shell
- Adapter has no access to `notes` or dialog state — locality preserved

## Consequences

- Layout mechanics become independently testable (deletion test: deleting adapter concentrates layout rules, not scattered).
- Component interface stays small; complexity moves behind the adapter seam.
- Mobile or print views can swap adapter without touching shell.
- Note-dialog locality preserved — dialog stays with the user interaction surface.
- No ADR conflicts: ADR-0027 (ESL class-day) and ADR-0021 (Convex quota) are orthogonal to presentation-layer seams.
