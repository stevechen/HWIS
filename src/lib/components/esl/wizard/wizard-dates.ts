/**
 * Pure date helpers for the ESL semester-setup wizard (ticket #226).
 *
 * No Convex imports, no wall-clock reads — every function takes its dates as
 * `YYYY-MM-DD` strings so the prototype and the real wizard share the exact
 * same arithmetic. Promotion path: move this file as-is; only the mock
 * holiday source (`mockOffDays`) gets replaced by the real gov import.
 */

export type Term = 'S1' | 'S2';

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function toDay(date: string): Date {
	return new Date(`${date}T00:00:00Z`);
}

function toISO(day: Date): string {
	return day.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` `n` days after `date` (UTC, so no Taipei/local drift). */
export function addDays(date: string, n: number): string {
	return toISO(new Date(toDay(date).getTime() + n * DAY_MS));
}

/** 0 = Sunday … 6 = Saturday, UTC. */
export function weekdayOf(date: string): number {
	return toDay(date).getUTCDay();
}

export function isWeekend(date: string): boolean {
	const day = weekdayOf(date);
	return day === 0 || day === 6;
}

export function weekdayLabel(date: string): string {
	return WEEKDAY_LABELS[weekdayOf(date)] ?? '';
}

const MONTH_BADGES: readonly string[] = [
	'JAN',
	'FEB',
	'MAR',
	'APR',
	'MAY',
	'JUN',
	'JUL',
	'AUG',
	'SEP',
	'OCT',
	'NOV',
	'DEC'
];

/**
 * Feedback F40: month title groups for one week ROW, rendered as merged
 * header cells ACROSS the top of the row inside the grid (not a side
 * gutter). Consecutive days in the same month collapse to one group whose
 * `span` is the day count; a straddle week yields two groups (e.g. W18:
 * DEC ×4 + JAN ×3); a single-month week yields one group spanning all 7.
 * A 7-day row can never span more than two months. Derived from the row's
 * actual dates.
 */
export function rowMonthSpans(dates: readonly string[]): Array<{ label: string; span: number }> {
	const spans: Array<{ label: string; span: number }> = [];
	for (const date of dates) {
		const label = MONTH_BADGES[Number(date.slice(5, 7)) - 1] ?? '';
		if (label === '') continue;
		const last = spans[spans.length - 1];
		if (last !== undefined && last.label === label) last.span += 1;
		else spans.push({ label, span: 1 });
	}
	return spans;
}

/** Exam slots of the Step 3 picker. */
export type ExamSlot = 'Exam 1' | 'Exam 2' | 'Final';

/**
 * Feedback F39: class-day fan-out per exam slot — the prototype mirror of
 * production `EXAM_SEED_WEEKDAYS` (Exam 1→2, Exam 2→2, Final Exam→3). The
 * single source the picker page reads instead of a hardcoded ternary, so
 * only Final ever fans out to 3.
 */
export const EXAM_SLOT_CLASS_DAYS: Readonly<Record<ExamSlot, 2 | 3>> = {
	'Exam 1': 2,
	'Exam 2': 2,
	Final: 3
};

/**
 * Feedback F49: chronological order gate — Exam 1 < Exam 2 < Final as a
 * full ordering. The user asked for 1↔2 explicitly; Final already sits at
 * the tail by auto-default (last class days of the window), so the same
 * rule extends to it. A slot's range must end strictly before every LATER
 * slot's range starts, and start strictly after every EARLIER slot's range
 * ends. Unset slots constrain nothing (only confirmed ranges bound).
 */
export const EXAM_SLOT_ORDER: readonly ExamSlot[] = ['Exam 1', 'Exam 2', 'Final'];

export interface ExamRangeBound {
	label: ExamSlot;
	first: string;
	last: string;
}

/**
 * Feedback F49: canonical order-constraint message, or null when
 * `[first, last]` for `active` satisfies the ordering against every
 * confirmed `other` range. Phrased earlier-first so both tabs name the
 * same constraint (e.g. `Exam 1 must end before Exam 2 starts`).
 */
export function examOrderViolation(
	active: ExamSlot,
	first: string,
	last: string,
	others: readonly ExamRangeBound[]
): string | null {
	const activeIndex = EXAM_SLOT_ORDER.indexOf(active);
	for (const other of others) {
		const otherIndex = EXAM_SLOT_ORDER.indexOf(other.label);
		if (otherIndex < 0 || otherIndex === activeIndex) continue;
		if (otherIndex > activeIndex) {
			if (!(last < other.first)) return `${active} must end before ${other.label} starts`;
		} else {
			if (!(first > other.last)) return `${other.label} must end before ${active} starts`;
		}
	}
	return null;
}

/** The Monday of the week containing `date` (`date` itself when Monday). */
export function mondayOfWeek(date: string): string {
	return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** `true` when `date` is a Monday. */
export function isMonday(date: string): boolean {
	return weekdayOf(date) === 1;
}

/**
 * The next Monday on or after `date` — the "or next Mon" half of the
 * spec's start-date defaults (S1: Aug 30, S2: Feb 11).
 */
export function nextMonday(date: string): string {
	const delta = (8 - weekdayOf(date)) % 7;
	return addDays(date, delta);
}

export interface SuggestedSemester {
	term: Term;
	schoolYear: string;
	reason: string;
}

/**
 * Semester suggestion from the current date (spec #215, story 8):
 * Jul–Sep → S1, Jan–Feb → S2, Mar–Jun → S2 of the current year,
 * Oct–Dec → S1 of next year. School years are `YYYY-YYYY`.
 */
export function suggestSemester(today: string): SuggestedSemester {
	const year = Number(today.slice(0, 4));
	const month = Number(today.slice(5, 7));
	if (month >= 7 && month <= 9) {
		return {
			term: 'S1',
			schoolYear: `${year}-${year + 1}`,
			reason: 'Jul–Sep: setting up this fall'
		};
	}
	if (month === 1 || month === 2) {
		return {
			term: 'S2',
			schoolYear: `${year - 1}-${year}`,
			reason: 'Jan–Feb: setting up this spring'
		};
	}
	if (month >= 3 && month <= 6) {
		return {
			term: 'S2',
			schoolYear: `${year - 1}-${year}`,
			reason: 'Mar–Jun: S2 of the current school year'
		};
	}
	return {
		term: 'S1',
		schoolYear: `${year + 1}-${year + 2}`,
		reason: 'Oct–Dec: setting up next fall'
	};
}

/**
 * Same suggestion pinned to an explicit term (for the S1/S2 toggle):
 * S1 of the school year containing this fall, S2 of the one containing
 * this spring.
 */
export function schoolYearForTerm(term: Term, today: string): string {
	const year = Number(today.slice(0, 4));
	const month = Number(today.slice(5, 7));
	if (term === 'S1') {
		const fall = month >= 7 ? year : year - 1;
		return `${fall}-${fall + 1}`;
	}
	const spring = month >= 7 ? year + 1 : year;
	return `${spring - 1}-${spring}`;
}

/** Anchor a school year halves: S1 starts in the fall, S2 in the spring. */
function fallYear(schoolYear: string): number {
	return Number(schoolYear.split('-')[0]);
}

function springYear(schoolYear: string): number {
	return Number(schoolYear.split('-')[1]);
}

/**
 * Start default (story 9, as amended by visual-validation feedback F2):
 * S1 → Aug 30 as-is; S2 → Feb 11 as-is; only a Sat/Sun anchor rolls
 * forward to next Monday. Deliberate deviation from spec story 10
 * (which snaps every pick to Monday): clicking a date picks that exact
 * date so a Friday Aug 30 start is allowed.
 */
export function defaultStartDate(term: Term, schoolYear: string): string {
	const anchor =
		term === 'S1' ? `${fallYear(schoolYear)}-08-30` : `${springYear(schoolYear)}-02-11`;
	if (isWeekend(anchor)) return nextMonday(anchor);
	return anchor;
}

/**
 * Step 1 picker rows (story 10, as amended by feedback F1): 2 weekly rows
 * for S1, 3 for S2, starting with the week containing the default start
 * date. When the anchor falls on Sat/Sun the default rolls to Monday, so
 * the anchor's week row is omitted entirely and the rows shift forward.
 * Returns the row Mondays.
 */
export function startPickerMondays(term: Term, schoolYear: string): string[] {
	const first = mondayOfWeek(defaultStartDate(term, schoolYear));
	const rows = term === 'S1' ? 2 : 3;
	return Array.from({ length: rows }, (_, i) => addDays(first, i * 7));
}

/**
 * End default (story 12): S1 → Jan 20 or the prior school day; S2 →
 * Jun 30 or the prior school day. Weekends step back; named off days
 * apply later once the holiday import lands.
 */
export function defaultEndDate(term: Term, schoolYear: string): string {
	let cursor =
		term === 'S1' ? `${springYear(schoolYear)}-01-20` : `${springYear(schoolYear)}-06-30`;
	while (isWeekend(cursor)) cursor = addDays(cursor, -1);
	return cursor;
}

/**
 * Step 2 picker rows (story 12): S1 → week of Jan 20 + next (2 rows);
 * S2 → week of Jun 30 (1 row). Returns the row Mondays.
 */
export function endPickerMondays(term: Term, schoolYear: string): string[] {
	const anchor =
		term === 'S1' ? `${springYear(schoolYear)}-01-20` : `${springYear(schoolYear)}-06-30`;
	const first = mondayOfWeek(anchor);
	return term === 'S1' ? [first, addDays(first, 7)] : [first];
}

export interface MockOffDay {
	date: string;
	name: string;
}

/**
 * Throwaway mock of the Taiwan gov holiday import (story 14). Five named
 * days pinned inside `[startDate, endDate]` so the Step 2 preview shows
 * real grey chips; the real wizard replaces this with
 * `previewGovImport` + `importGovOffDays`. Every name carries the Mock
 * prefix so screenshots can never be mistaken for real data.
 */
export function mockOffDays(
	term: Term,
	schoolYear: string,
	startDate: string,
	endDate: string
): MockOffDay[] {
	const fall = fallYear(schoolYear);
	const spring = springYear(schoolYear);
	const candidates: Array<[string, string]> =
		term === 'S1'
			? [
					[addDays(startDate, 9), 'Mock: Mid-Autumn Festival'],
					[`${fall}-10-10`, 'Mock: National Day'],
					[`${spring}-01-01`, "Mock: New Year's Day"],
					[addDays(endDate, -12), 'Mock: Peace Memorial bridge'],
					[addDays(endDate, -5), 'Mock: Tomb-Sweeping bridge']
				]
			: [
					[addDays(startDate, 6), 'Mock: Peace Memorial Day'],
					[addDays(startDate, 20), 'Mock: Spring Break start'],
					[`${spring}-05-01`, 'Mock: Labor Day'],
					[addDays(endDate, -16), 'Mock: Dragon Boat Festival'],
					[addDays(endDate, -2), 'Mock: Bridge Holiday']
				];
	const days: MockOffDay[] = [];
	for (const [date, name] of candidates) {
		if (date < startDate || date > endDate) continue;
		// Nudge onto a weekday so every mock day reads as a class-day skip.
		let cursor = date;
		while (isWeekend(cursor) && cursor >= startDate) cursor = addDays(cursor, -1);
		if (cursor < startDate || days.some((day) => day.date === cursor)) continue;
		days.push({ date: cursor, name });
	}
	return days.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * N class days from `from` (inclusive), skipping weekends and `offDays`
 * — the same fan-out rule as `esl/events.create` exam ranges. A
 * weekend/off click snaps forward to the next class day first.
 */
export function collectClassDays(from: string, count: number, offDays: Set<string>): string[] {
	const days: string[] = [];
	let cursor = from;
	for (let i = 0; i < 366 && days.length < count; i++) {
		if (!isWeekend(cursor) && !offDays.has(cursor)) days.push(cursor);
		cursor = addDays(cursor, 1);
	}
	return days;
}

/**
 * A 5-school-day window for Passport Check / Workbook Check (spec story 22).
 * Skips weekends, off days, AND exam days (passed via `skipSet`).
 * Returns the window dates or fewer if the term boundary is hit.
 */
export function dueWindowDates(start: string, skipSet: Set<string>, endBound: string): string[] {
	const days: string[] = [];
	let cursor = start;
	for (let i = 0; i < 366 && days.length < 5 && cursor <= endBound; i++) {
		if (!isWeekend(cursor) && !skipSet.has(cursor)) days.push(cursor);
		cursor = addDays(cursor, 1);
	}
	return days;
}

/**
 * Feedback F45: N class days on/before `before` (inclusive), walking
 * backward and skipping weekends and `offDays`, never going below
 * `startBound`. Returns ascending (earliest first) so the range reads
 * like the forward fan-out. Shares arithmetic with `collectClassDays`
 * (same skip rule, opposite direction). Used for the Final auto-default:
 * the last 3 class days of the term window. May return fewer than
 * `count` when the window is too short — the caller sets whatever fits.
 */
export function collectClassDaysBackward(
	before: string,
	count: number,
	offDays: Set<string>,
	startBound: string
): string[] {
	const days: string[] = [];
	let cursor = before;
	for (let i = 0; i < 366 && days.length < count && cursor >= startBound; i++) {
		if (!isWeekend(cursor) && !offDays.has(cursor)) days.unshift(cursor);
		cursor = addDays(cursor, -1);
	}
	return days;
}

export interface PreviewExam {
	label: string;
	dates: string[];
}

export interface PreviewDay {
	date: string;
	weekday: string;
	inRange: boolean;
	isWeekend: boolean;
	offName: string | null;
	examLabel: string | null;
}

export interface PreviewWeek {
	weekIndex: number;
	monday: string;
	days: PreviewDay[];
}

/**
 * Semester week rows for the calendar preview: 7-day rows from the Monday
 * of `startDate`, 1-based school-week numbers, days outside
 * `[startDate, endDate]` flagged out-of-range. Exam labels win over off
 * names on the rare overlap.
 */
export function buildPreviewWeeks(
	startDate: string,
	endDate: string,
	offDays: readonly MockOffDay[],
	exams: readonly PreviewExam[]
): PreviewWeek[] {
	const offByDate = new Map(offDays.map((day) => [day.date, day.name]));
	const examByDate = new Map<string, string>();
	for (const exam of exams) {
		for (const date of exam.dates) examByDate.set(date, exam.label);
	}
	const firstMonday = mondayOfWeek(startDate);
	const weeks: PreviewWeek[] = [];
	let monday = firstMonday;
	let weekIndex = 1;
	while (monday <= endDate && weekIndex <= 60) {
		const days: PreviewDay[] = [];
		for (let i = 0; i < 7; i++) {
			const date = addDays(monday, i);
			days.push({
				date,
				weekday: weekdayLabel(date),
				inRange: date >= startDate && date <= endDate,
				isWeekend: isWeekend(date),
				offName: offByDate.get(date) ?? null,
				examLabel: examByDate.get(date) ?? null
			});
		}
		weeks.push({ weekIndex, monday, days });
		monday = addDays(monday, 7);
		weekIndex++;
	}
	return weeks;
}
