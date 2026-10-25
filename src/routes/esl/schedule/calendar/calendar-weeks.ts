import type { ScheduleDayRow } from '$convex/shared/esl';

/**
 * The week-fragment geometry the teacher calendar renders (ticket #196,
 * ported conceptually from prototype iteration 10 — no fixture code).
 *
 * Rows arrive from the `teacherDays` join already filtered to one class;
 * this module only groups them into school-week fragments, derives the
 * row-span banners from collapsed due windows, and marks past/today/next.
 * Pure and deterministic: `today` is a parameter, never a wall-clock read.
 */

export type CalendarCardStatus =
	| 'teaching'
	| 'off'
	| 'no_class'
	| 'exam'
	| 'partial'
	| 'oral'
	| 'g9_mock';

export interface CalendarCardDue {
	title: string;
	reminderKind: string;
	windowStart: string;
	windowEnd: string;
}

export interface CalendarCard {
	date: string;
	weekdayLabel: string;
	period: number;
	status: CalendarCardStatus;
	cause: string | null;
	countdown: string | null;
	badges: string[];
	/** Dues that opted out of the week banner ride their own day card (#224). */
	dues: CalendarCardDue[];
	past: boolean;
	isToday: boolean;
}

export interface CalendarBanner {
	title: string;
	reminderKind: string;
	windowStart: string;
	windowEnd: string;
}

export interface CalendarWeekFragment {
	weekIndex: number;
	banners: CalendarBanner[];
	cards: CalendarCard[];
}

const WEEKDAY_SHORT: Record<string, string> = {
	Monday: 'Mon',
	Tuesday: 'Tue',
	Wednesday: 'Wed',
	Thursday: 'Thu',
	Friday: 'Fri',
	Saturday: 'Sat',
	Sunday: 'Sun'
};

const MONTH_FULL = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** Full month name for a `YYYY-MM` key, e.g. `monthName('2025-10')` → October. */
export function monthName(yearMonth: string): string {
	return MONTH_FULL[Number(yearMonth.slice(5, 7)) - 1] ?? yearMonth;
}

function toDay(date: string): Date {
	return new Date(`${date}T12:00:00`);
}

/** 1-based school-week index of a date from the semester start. */
export function weekIndexOf(date: string, semesterStart: string): number {
	return Math.floor((toDay(date).getTime() - toDay(semesterStart).getTime()) / (7 * 86400000)) + 1;
}

/** Format a calendar card as `Nov. 2` or `2`, without leading zeroes. */
export function formatDay(date: string, showMonth: boolean): string {
	const month = Number(date.slice(5, 7));
	const day = Number(date.slice(8, 10));
	const monthAbbreviation = [
		'',
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	][month];
	return showMonth ? `${monthAbbreviation} ${day}` : `${day}`;
}

export function slash(date: string): string {
	return date.slice(5).replace('-', '/');
}

/**
 * The calendar header/menu label for one class: the corrected short label
 * with a type suffix only when it adds information (ticket #204).
 *
 * The short label already carries the grade for G7–G9 and the whole name for
 * G10, so suffixing their types would duplicate (`G9 Bas. 3 G9`,
 * `H101A H10A`). Only the CLIL/Comm lesson is dropped by the short label, so
 * only it stays — without it a cohort's two classes would read identically.
 */
export function calendarClassLabel(short: string, type: string): string {
	if (type === 'CLIL' || type === 'Comm') return `${short} ${type}`;
	return short;
}

/**
 * Group one class's day rows into week-keyed fragments. Rows may arrive
 * unsorted; fragments and cards come out in date order. Exam rows carry no
 * count-up (their chip + cause say what they are), and off/no-class days
 * carry none either — nothing meets, so nothing counts toward the anchor;
 * every other counted row reads `Class k of n to <label>`, right-aligned in
 * the card.
 */
export function buildCalendarFragments(args: {
	rows: readonly ScheduleDayRow[];
	semesterStart: string;
	today: string;
}): { fragments: CalendarWeekFragment[]; nextDate: string | null } {
	const ordered = [...args.rows].sort(
		(a, b) => a.date.localeCompare(b.date) || a.period - b.period
	);
	const fragments: CalendarWeekFragment[] = [];
	/** Due windows already bannered per fragment, by `title|start|end`. */
	const bannered = new Map<number, Set<string>>();
	for (const row of ordered) {
		const weekIndex = weekIndexOf(row.date, args.semesterStart);
		let fragment = fragments.find((candidate) => candidate.weekIndex === weekIndex);
		if (!fragment) {
			fragment = { weekIndex, banners: [], cards: [] };
			fragments.push(fragment);
			bannered.set(weekIndex, new Set());
		}
		fragment.cards.push({
			date: row.date,
			weekdayLabel: WEEKDAY_SHORT[row.weekday] ?? row.weekday.slice(0, 3),
			period: row.period,
			status: row.status === 'oral_exam' ? 'oral' : row.status,
			cause: row.cause,
			// Off and no-class days carry no count-up (#203 parity with the
			// list view): nothing meets, so nothing counts toward the anchor.
			countdown:
				row.count &&
				row.status !== 'exam' &&
				row.status !== 'oral_exam' &&
				row.status !== 'off' &&
				row.status !== 'no_class'
					? `${row.count.position} of ${row.count.total}`
					: null,
			badges: [...row.badges],
			dues: [],
			past: row.date < args.today,
			isToday: row.date === args.today
		});
		for (const due of row.dues) {
			// Reminders default to banners (#224); only an explicit opt-out
			// keeps a due on its own day card.
			if (due.isBanner === false) {
				fragment.cards[fragment.cards.length - 1].dues.push({
					title: due.title,
					reminderKind: due.reminderKind,
					windowStart: due.windowStart,
					windowEnd: due.windowEnd
				});
				continue;
			}
			// A banner rides the week the WINDOW starts, not the collapse
			// day: quiz windows anchor on the school week's Monday and
			// overflow into the next calendar week when a holiday eats a
			// class day, yet the quiz still belongs to the week whose
			// classes carry it. Degrades to the row's week when the anchor
			// week has no fragment of its own.
			const bannerWeek = weekIndexOf(due.windowStart, args.semesterStart);
			const bannerFragment =
				fragments.find((candidate) => candidate.weekIndex === bannerWeek) ?? fragment;
			const seen = bannered.get(bannerFragment.weekIndex);
			const key = `${due.title}|${due.windowStart}|${due.windowEnd}`;
			if (seen?.has(key)) continue;
			seen?.add(key);
			bannerFragment.banners.push({
				title: due.title,
				reminderKind: due.reminderKind,
				windowStart: due.windowStart,
				windowEnd: due.windowEnd
			});
		}
	}
	for (const fragment of fragments) {
		fragment.banners.sort(
			(a, b) => a.windowStart.localeCompare(b.windowStart) || a.title.localeCompare(b.title)
		);
	}
	const upcoming = ordered.map((row) => row.date).find((date) => date > args.today) ?? null;
	return { fragments, nextDate: upcoming };
}
