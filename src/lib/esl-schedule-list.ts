import type { ScheduleDayRow } from '$convex/shared/esl';

/** Client-side class-type filter for the teacher list view. G10 has no target of its own. */
export const SCHEDULE_TARGET_FILTERS = ['all', 'CLIL', 'Comm', 'G9'] as const;
export type ScheduleTargetFilter = (typeof SCHEDULE_TARGET_FILTERS)[number];

/** Lookup key joining an event's date to its label, shared by rows and dues. */
export function eventNoteKey(date: string, label: string): string {
	return `${date}|${label}`;
}

/** Index admin event notes by date+label so rows resolve their Note cell without a join. */
export function buildEventNoteMap(
	events: readonly { date: string; label: string; note?: string }[]
): Record<string, string> {
	const notes: Record<string, string> = {};
	for (const event of events) {
		if (event.note !== undefined && event.note !== '') {
			notes[eventNoteKey(event.date, event.label)] = event.note;
		}
	}
	return notes;
}

/** Class context every meeting row carries: name plus period (period-aware scan). */
export function classContext(row: ScheduleDayRow, classNames: Record<string, string>): string {
	const name = classNames[row.classId] ?? `${row.type} class`;
	return `${name} P${row.period}`;
}

/**
 * The countdown cell (#203): remaining classes in the current exam block,
 * decreasing to `0` at the last class before the exam. Blank on Off, No
 * class, and Exam rows, and blank past the final anchor (count null).
 */
export function countdownText(row: ScheduleDayRow): string {
	if (row.status === 'off' || row.status === 'no_class' || row.status === 'exam') return '';
	if (row.count === null) return '';
	return String(row.count.total - row.count.position);
}

/**
 * The legacy generic label the seed used for the third exam range. #203
 * renames the canonical labels to Exam 1 / Exam 2 / Final Exam.
 */
const LEGACY_FINAL_LABEL = 'Final exam';

/** Canonical exam labels, in term order. */
export const EXAM_LABELS = ['Exam 1', 'Exam 2', 'Final Exam'] as const;

/** Normalize a stored exam cause to its canonical display label. */
export function examDisplayLabel(cause: string | null): string {
	if (cause === LEGACY_FINAL_LABEL) return 'Final Exam';
	return cause ?? 'Exam';
}

/**
 * The description cell, ported from the scheduler's table: the meeting
 * context, the cause behind any non-teaching status, and collapsed dues.
 * #203 normalizes exam rows to their canonical labels (Exam 1 / Exam 2 /
 * Final Exam). Badges ride separately as chips; the TSV payload appends
 * them in brackets.
 */
export function descriptionText(row: ScheduleDayRow, classNames: Record<string, string>): string {
	const context = classContext(row, classNames);
	switch (row.status) {
		case 'exam':
			return examDisplayLabel(row.cause);
		case 'off':
			return `${context} · 🎉 Off — ${row.cause ?? 'Off'}`;
		case 'no_class':
			return `${context} · No-class — ${row.cause ?? 'No class'}`;
		case 'partial':
		case 'oral_exam':
		case 'teaching': {
			const cause = row.cause === null ? '' : ` · ${row.cause}`;
			const dues = row.dues.length === 0 ? '' : ` · ${row.dues.map((due) => due.label).join('; ')}`;
			return `${context}${cause}${dues}`;
		}
	}
}

/**
 * The note cell: the admin event note behind the row's cause plus any notes
 * on collapsed dues. Teacher notes never surface here — the caller only feeds
 * this map from `esl/events`, never from teacher-note reads.
 */
export function noteText(row: ScheduleDayRow, eventNotes: Record<string, string>): string {
	const notes: string[] = [];
	if (row.cause !== null) {
		const cause = eventNotes[eventNoteKey(row.date, row.cause)];
		if (cause !== undefined) notes.push(cause);
	}
	for (const due of row.dues) {
		const dueNote = eventNotes[eventNoteKey(due.windowStart, due.label)];
		if (dueNote !== undefined && !notes.includes(dueNote)) notes.push(dueNote);
	}
	return notes.join('; ');
}

/** One TSV line per row, mirroring the scheduler's `#\tDate\tDescription\tNote` envelope. */
export function buildScheduleTsv(
	rows: readonly ScheduleDayRow[],
	classNames: Record<string, string>,
	eventNotes: Record<string, string>
): string {
	const lines = ['#\tDate\tDescription\tNote'];
	for (const row of rows) {
		const badges = row.badges.length === 0 ? '' : ` (${row.badges.join('; ')})`;
		lines.push(
			[
				countdownText(row),
				row.date,
				`${descriptionText(row, classNames)}${badges}`,
				noteText(row, eventNotes)
			].join('\t')
		);
	}
	return lines.join('\n');
}
