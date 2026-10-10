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

export type CalendarCardStatus = 'teaching' | 'off' | 'no_class' | 'exam' | 'partial' | 'oral';

export interface CalendarCard {
	date: string;
	weekdayLabel: string;
	period: number;
	status: CalendarCardStatus;
	cause: string | null;
	countdown: string | null;
	badges: string[];
	past: boolean;
	isToday: boolean;
}

export interface CalendarBanner {
	title: string;
	start: string;
	end: string;
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

/** `9/01` style short date for cards and banners. */
export function slash(date: string): string {
	return date.slice(5).replace('-', '/');
}

/**
 * Group one class's day rows into week-keyed fragments. Rows may arrive
 * unsorted; fragments and cards come out in date order. Exam rows carry no
 * count-up (their chip + cause say what they are); every other counted row
 * reads `Class k/n to <label>`, right-aligned in the card.
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
	/** Due windows already bannered per fragment, by `label|start|end`. */
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
			countdown:
				row.count && row.status !== 'exam'
					? `Class ${row.count.position}/${row.count.total} to ${row.count.label}`
					: null,
			badges: [...row.badges],
			past: row.date < args.today,
			isToday: row.date === args.today
		});
		const seen = bannered.get(weekIndex);
		for (const due of row.dues) {
			const key = `${due.label}|${due.windowStart}|${due.windowEnd}`;
			if (seen?.has(key)) continue;
			seen?.add(key);
			fragment.banners.push({ title: due.label, start: due.windowStart, end: due.windowEnd });
		}
	}
	for (const fragment of fragments) {
		fragment.banners.sort(
			(a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title)
		);
	}
	const upcoming = ordered.map((row) => row.date).find((date) => date > args.today) ?? null;
	return { fragments, nextDate: upcoming };
}
