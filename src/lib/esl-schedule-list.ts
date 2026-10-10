import type { ScheduleDayRow } from '$convex/shared/esl';

/**
 * Returns the countdown text for a schedule row.
 * Format: "Class {position}/{total} to {label}"
 * Returns empty string for off, no_class, exam rows or when count is null.
 */
export function countdownText(row: ScheduleDayRow): string {
	if (!row.count) return '';
	if (row.status === 'off' || row.status === 'no_class' || row.status === 'exam') return '';
	return `Class ${row.count.position}/${row.count.total} to ${row.count.label}`;
}

/**
 * Returns the description text for a schedule row.
 * Combines class name, period, cause, and badges.
 */
export function descriptionText(row: ScheduleDayRow, classNames: Record<string, string>): string {
	const className = classNames[row.classId] ?? row.classId;
	const periodStr = `P${row.period}`;

	switch (row.status) {
		case 'teaching': {
			const base = `${className} ${periodStr}`;
			if (row.badges.length > 0) {
				return `${base} · ${row.badges.join(' · ')}`;
			}
			return base;
		}
		case 'off':
			return `Off — ${row.cause ?? 'Off'} 🎉`;
		case 'no_class': {
			const base = `${className} ${periodStr} · ${row.cause ?? 'No class'}`;
			if (row.badges.length > 0) {
				return `${base} · ${row.badges.join(' · ')}`;
			}
			return base;
		}
		case 'partial': {
			const base = `${className} ${periodStr} · ${row.cause ?? 'Partial'}`;
			if (row.badges.length > 0) {
				return `${base} · ${row.badges.join(' · ')}`;
			}
			return base;
		}
		case 'oral_exam':
			return `${className} ${periodStr} · ${row.cause ?? 'Oral exam'}`;
		case 'exam':
			return row.cause ?? 'Exam';
		default:
			return className;
	}
}

/**
 * Builds a TSV string from schedule rows for download/copy.
 * Header: #\tDate\tDescription\tNote
 * Columns: countdown, date, description, event note
 */
export function buildScheduleTsv(
	rows: ScheduleDayRow[],
	classNames: Record<string, string>,
	eventNotes: Record<string, string>
): string {
	const header = '#\tDate\tDescription\tNote';
	const dataRows = rows.map((row) => {
		const countdown = countdownText(row);
		const date = row.date;
		const description = descriptionText(row, classNames).replace(/\t/g, ' ').replace(/\n/g, ' ');
		// Find event note by matching cause to event label (eventNotes is label -> note)
		let note = '';
		if (row.cause && eventNotes[row.cause]) {
			note = eventNotes[row.cause];
		}
		note = note.replace(/\t/g, ' ').replace(/\n/g, ' ');
		return `${countdown}\t${date}\t${description}\t${note}`;
	});
	return [header, ...dataRows].join('\n');
}

/**
 * Builds event note map from events array for efficient lookup.
 * Maps event label to note for matching with row causes.
 */
export function buildEventNoteMap(
	events: Array<{ _id: string; label: string; note?: string }>
): Record<string, string> {
	const map: Record<string, string> = {};
	for (const event of events) {
		if (event.note) {
			map[event.label] = event.note;
		}
	}
	return map;
}
