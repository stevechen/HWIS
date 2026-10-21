import { ESL_EXAM_TITLES, type EslReminderKind, type ScheduleDayRow } from '$convex/shared/esl';

/** Client-side class-type filter for the teacher list view. G10 has no target of its own. */
export const SCHEDULE_TARGET_FILTERS = ['all', 'CLIL', 'Comm', 'G7', 'G8', 'G9', 'H1'] as const;
export type ScheduleTargetFilter = (typeof SCHEDULE_TARGET_FILTERS)[number];

/** `9/01` style short date for cards, banners, and the copied schedule. */
export function slash(date: string): string {
	return date.slice(5).replace('-', '/');
}

/** 1-based school-week index of a date from the semester start. */
export function weekIndexOf(date: string, semesterStart: string): number {
	const day = (value: string) => new Date(`${value}T12:00:00`).getTime();
	return Math.floor((day(date) - day(semesterStart)) / (7 * 86400000)) + 1;
}

/** Lookup key joining an event's date to its title, shared by rows and dues. */
export function eventNoteKey(date: string, title: string): string {
	return `${date}|${title}`;
}

/** Index admin event notes by date+title so rows resolve their Note cell without a join. */
export function buildEventNoteMap(
	events: readonly { date: string; title: string; note?: string }[]
): Record<string, string> {
	const notes: Record<string, string> = {};
	for (const event of events) {
		if (event.note !== undefined && event.note !== '') {
			notes[eventNoteKey(event.date, event.title)] = event.note;
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

/**
 * Canonical exam labels, in term order — single-sourced from the backend's
 * locked `ESL_EXAM_TITLES` so the list can never drift from the form.
 */
export const EXAM_LABELS = ESL_EXAM_TITLES;

/** Normalize a stored exam cause to its canonical display label. */
export function examDisplayLabel(cause: string | null): string {
	if (cause === LEGACY_FINAL_LABEL) return 'Final Exam';
	return cause ?? 'Exam';
}

/**
 * The description cell for the schedule list view.
 * #203 normalizes exam rows to their canonical labels (Exam 1 / Exam 2 /
 * Final Exam). Badges ride separately as chips; the TSV payload appends
 * them in brackets.
 *
 * #212: an out-of-window partial meeting reads as class as usual — the
 * context with no title — while the note column keeps the note. Every other
 * partial row shows title+note.
 *
 * The description no longer includes class name and period — those are
 * implied by the selected class filter.
 */
export function descriptionText(row: ScheduleDayRow, _classNames: Record<string, string>): string {
	switch (row.status) {
		case 'exam':
			return examDisplayLabel(row.cause);
		case 'off':
			return row.cause && row.cause !== 'Off' ? `🎉 Off — ${row.cause}` : '🎉 Off';
		case 'no_class':
			return row.cause && row.cause !== 'No class' ? `No class — ${row.cause}` : 'No class';
		case 'oral_exam':
			return 'Oral Exam';
		case 'g9_mock':
			return row.cause ?? 'G9 Mock';
		case 'partial':
		case 'teaching': {
			const parts: string[] = [];
			if (row.cause !== null && row.outOfWindow !== true) {
				parts.push(row.cause);
			}
			// Banner dues ride the week row (#224), so they stay out of the
			// day chip; chip dues append their titles as before.
			const dues = row.dues.filter((due) => !due.isBanner).map((due) => due.title);
			parts.push(...dues);
			return parts.join(' · ') || 'Class';
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
		const dueNote = eventNotes[eventNoteKey(due.windowStart, due.title)];
		if (dueNote !== undefined && !notes.includes(dueNote)) notes.push(dueNote);
	}
	return notes.join('; ');
}

/** A reminder due riding a week row: the title plus the window it collapsed from. */
export interface ScheduleWeekBanner {
	title: string;
	reminderKind: EslReminderKind;
	windowStart: string;
	windowEnd: string;
}

/**
 * The banner chip text: the due title plus its window, the window dropped
 * when a single day spans it. One source for the list row and the calendar
 * week header, so the two views never word a window differently.
 */
export function bannerDueLabel(banner: {
	title: string;
	windowStart: string;
	windowEnd: string;
}): string {
	return banner.windowStart === banner.windowEnd
		? banner.title
		: `${banner.title} · ${slash(banner.windowStart)}–${slash(banner.windowEnd)}`;
}

/** Stable key for the `{#each}` over one week's banners. */
export function bannerKey(banner: ScheduleWeekBanner): string {
	return `${banner.title}|${banner.windowStart}|${banner.windowEnd}`;
}

/**
 * The banner dues landing in each school week (#224), keyed by the week
 * number the week row carries.
 *
 * A due collapses onto one class day, but a teacher reads several classes at
 * once and the same reminder reaches more than one of them — so a week shows
 * each due once, ordered by its window. Chip dues (`isBanner` off) never
 * become banners; they stay on their own day row.
 */
export function buildWeekBanners(
	rows: readonly ScheduleDayRow[],
	semesterStart: string
): Map<number, ScheduleWeekBanner[]> {
	const byWeek = new Map<number, ScheduleWeekBanner[]>();
	const seen = new Set<string>();
	for (const row of rows) {
		for (const due of row.dues) {
			if (!due.isBanner) continue;
			const key = bannerKey(due);
			if (seen.has(key)) continue;
			seen.add(key);
			const week = weekIndexOf(row.date, semesterStart);
			const banners = byWeek.get(week) ?? [];
			banners.push({
				title: due.title,
				reminderKind: due.reminderKind,
				windowStart: due.windowStart,
				windowEnd: due.windowEnd
			});
			byWeek.set(week, banners);
		}
	}
	for (const banners of byWeek.values()) {
		banners.sort(
			(a, b) => a.windowStart.localeCompare(b.windowStart) || a.title.localeCompare(b.title)
		);
	}
	return byWeek;
}

/** One TSV line per row, mirroring the scheduler's `#\tDate\tDescription\tNote` envelope. */
export function buildScheduleTsv(
	rows: readonly ScheduleDayRow[],
	classNames: Record<string, string>,
	eventNotes: Record<string, string>,
	semesterStart: string
): string {
	const lines = ['#\tDate\tDescription\tNote'];
	const banners = buildWeekBanners(rows, semesterStart);
	let week = 0;
	for (const row of rows) {
		const rowWeek = weekIndexOf(row.date, semesterStart);
		if (rowWeek !== week) {
			week = rowWeek;
			const bannerText = (banners.get(week) ?? [])
				.map((banner) => bannerDueLabel(banner))
				.join('; ');
			if (bannerText !== '') lines.push(`\t\tWeek ${week} · ${bannerText}\t`);
		}
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
