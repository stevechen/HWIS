/**
 * ESL shared types and utilities.
 * Pure functions for schedule computation, testable without a database.
 */

// ============================================================================
// Basic types
// ============================================================================

/** ESL grades: 7–10. */
export const ESL_GRADES = [7, 8, 9, 10] as const;
export type EslGrade = (typeof ESL_GRADES)[number];

/** Whether a grade is levelled (has ability bands). Grade 10 is not levelled. */
export function isLevelledGrade(grade: number): grade is 7 | 8 | 9 {
	return grade >= 7 && grade <= 9;
}

/** ESL ability levels for levelled grades, easiest first. */
export const ESL_LEVELS = ['Pre-Ele', 'Elementary', 'Basic', 'Intermediate', 'Advanced'] as const;
export type EslLevel = (typeof ESL_LEVELS)[number];

/** Whether a string is one of the official ESL level names. */
export function isEslLevel(level: string): level is EslLevel {
	return (ESL_LEVELS as readonly string[]).includes(level);
}

/** ESL class numbers for levelled grades. */
export const ESL_CLASS_NUMBERS = ['1', '2'] as const;
export type EslClassNumber = (typeof ESL_CLASS_NUMBERS)[number];

/** Grade 10 class numbers (base classes H101–H110, zero-padded). */
export const ESL_GRADE10_CLASS_NUMBERS = [
	'01',
	'02',
	'03',
	'04',
	'05',
	'06',
	'07',
	'08',
	'09',
	'10'
] as const;
export type EslGrade10ClassNumber = (typeof ESL_GRADE10_CLASS_NUMBERS)[number];

/** Validates a grade 10 class number. */
export function isValidGrade10ClassNumber(classNumber: string): boolean {
	return ESL_GRADE10_CLASS_NUMBERS.includes(classNumber as EslGrade10ClassNumber);
}

/** ESL class types. */
export const ESL_CLASS_TYPES = ['CLIL', 'Comm', 'G9', 'H10A', 'H10B'] as const;
export type EslClassType = (typeof ESL_CLASS_TYPES)[number];

/** Whether a class type is a grade 10 section. */
export function isGrade10ClassType(type: EslClassType): type is 'H10A' | 'H10B' {
	return type === 'H10A' || type === 'H10B';
}

/** The section letter for a grade 10 class type. */
export function grade10SectionOf(type: EslClassType): 'A' | 'B' | null {
	if (type === 'H10A') return 'A';
	if (type === 'H10B') return 'B';
	return null;
}

/** Grade 10 levels (ability bands A/B, A is higher). */
export const ESL_GRADE10_LEVELS = ['A', 'B'] as const;
export type EslGrade10Level = (typeof ESL_GRADE10_LEVELS)[number];

/** Whether a string is a grade 10 level. */
export function isGrade10Level(level: string): level is EslGrade10Level {
	return ESL_GRADE10_LEVELS.includes(level as EslGrade10Level);
}

/** ESL cohort key (year + grade + level + classNumber). */
export type EslCohortKey = {
	year: string;
	grade: number;
	level?: string;
	classNumber: string;
};

/** ESL meeting days. */
export const ESL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export type EslDay = (typeof ESL_DAYS)[number];

/** ESL period numbers 1–8. */
export const ESL_PERIOD_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type EslPeriod = (typeof ESL_PERIOD_NUMBERS)[number];

/** Whether a number is a valid ESL period. */
export function isEslPeriod(period: number): period is EslPeriod {
	return ESL_PERIOD_NUMBERS.includes(period as EslPeriod);
}

/** Period time strings for display. */
export const eslPeriodTimes: Record<EslPeriod, { start: string; end: string }> = {
	1: { start: '08:10', end: '08:55' },
	2: { start: '09:00', end: '09:45' },
	3: { start: '09:55', end: '10:40' },
	4: { start: '10:45', end: '11:30' },
	5: { start: '12:30', end: '13:15' },
	6: { start: '13:20', end: '14:05' },
	7: { start: '14:10', end: '14:55' },
	8: { start: '15:00', end: '15:45' }
};

/** Meeting label like "Mon P3". */
export function eslMeetingLabel(meeting: { day: EslDay; period: number }): string {
	return `${meeting.day.slice(0, 3)} P${meeting.period}`;
}

// ============================================================================
// Event types
// ============================================================================

/** The eight typed school events an admin can place on a semester. */
export const ESL_EVENT_TYPES = [
	'task_due',
	'homework_due',
	'quiz',
	'off',
	'no_class',
	'partial',
	'exam',
	'start_school'
] as const;
export type EslEventType = (typeof ESL_EVENT_TYPES)[number];

/** Whether a string names one of the eight event types. */
export function isEslEventType(type: string): type is EslEventType {
	return (ESL_EVENT_TYPES as readonly string[]).includes(type);
}

/** Which classes an event reaches. */
export const ESL_EVENT_TARGETS = ['all', 'CLIL', 'Comm', 'G9'] as const;
export type EslEventTarget = (typeof ESL_EVENT_TARGETS)[number];

/** Whether a string names one of the four event targets. */
export function isEslEventTarget(target: string): target is EslEventTarget {
	return (ESL_EVENT_TARGETS as readonly string[]).includes(target);
}

/** The ranged due-types: the only types that may carry an inclusive endDate. */
export const ESL_RANGED_EVENT_TYPES: readonly EslEventType[] = ['task_due', 'homework_due', 'quiz'];

/** Whether an event type takes an inclusive endDate range. */
export function isRangedEventType(type: EslEventType): boolean {
	return (ESL_RANGED_EVENT_TYPES as readonly EslEventType[]).includes(type);
}

// ============================================================================
// Semester terms
// ============================================================================

/** The ESL semester terms: S1 then S2 of a school year. */
export const ESL_SEMESTER_TERMS = ['S1', 'S2'] as const;
export type EslSemesterTerm = (typeof ESL_SEMESTER_TERMS)[number];

/** Whether a string names one of the two semester terms. */
export function isEslSemesterTerm(term: string): term is EslSemesterTerm {
	return (ESL_SEMESTER_TERMS as readonly string[]).includes(term);
}

// ============================================================================
// Date utilities
// ============================================================================

/** Dates are `YYYY-MM-DD` strings, compared lexically. */
export function isValidEslDate(date: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
	const [year, month, day] = date.split('-').map(Number);
	if (month < 1 || month > 12 || day < 1 || day > 31) return false;
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return day <= daysInMonth;
}

/** The weekday name of a `YYYY-MM-DD` date at noon UTC; null on weekends. */
export function weekdayOfDate(date: string): EslDay | null {
	const [year, month, day] = date.split('-').map(Number);
	const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
	const name = (
		['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
	)[weekday];
	return name === 'Sunday' || name === 'Saturday' ? null : (name as EslDay);
}

/** Step a `YYYY-MM-DD` date forward one calendar day. */
export function nextEslDate(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10);
}

/** Step a `YYYY-MM-DD` date back one calendar day. */
export function prevEslDate(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day - 1, 12)).toISOString().slice(0, 10);
}

/** Whether a `YYYY-MM-DD` date falls on a weekend. */
export function isWeekendEslDate(date: string): boolean {
	return weekdayOfDate(date) === null;
}

// ============================================================================
// Schedule types (for teacher day view)
// ============================================================================

/** One weekly meeting occurrence as the query reads it. */
export type ScheduleMeetingInput = {
	classId: string;
	type: EslClassType;
	cohortGrade: number;
	day: EslDay;
	period: number;
};

/** One semester event as the query reads it. */
export type ScheduleEventInput = {
	type: EslEventType;
	label: string;
	target: EslEventTarget;
	date: string;
	endDate?: string;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
};

/** A due collapsed onto a day row: the label plus its reminder window. */
export type ScheduleDue = {
	label: string;
	type: 'task_due' | 'homework_due' | 'quiz';
	windowStart: string;
	windowEnd: string;
};

/** The teaching status a day row carries. */
export type ScheduleDayStatus = 'teaching' | 'off' | 'no_class' | 'exam' | 'partial' | 'oral_exam';

/** One rendered day-view row. */
export type ScheduleDayRow = {
	date: string;
	weekday: EslDay;
	classId: string;
	type: EslClassType;
	cohortGrade: number;
	period: number;
	status: ScheduleDayStatus;
	/** The human cause: the event label behind a non-teaching status. */
	cause: string | null;
	/** Render badges: window spans, out-of-window marks, oral marks. */
	badges: string[];
	/** Dues collapsed onto this day (latest-eligible rule). */
	dues: ScheduleDue[];
	/**
	 * The per-term count-up (`Class k/n to <label>`) or null past the final
	 * anchor. Exams carry their own label; teaching days count toward their
	 * term's exam.
	 */
	count: { position: number; total: number; label: string } | null;
};

/** Display order of day rows: date, then class, then period. */
function compareDayRows(a: ScheduleDayRow, b: ScheduleDayRow): number {
	return a.date.localeCompare(b.date) || a.classId.localeCompare(b.classId) || a.period - b.period;
}

/** Whether an event reaches a class. */
export function eventReachesClass(
	target: EslEventTarget,
	classType: EslClassType,
	cohortGrade: number
): boolean {
	if (target === 'all') return true;
	if (cohortGrade === 10) return false;
	if (target === 'CLIL') return classType === 'CLIL';
	if (target === 'Comm') return classType === 'Comm';
	return classType === 'G9';
}

/** Whether a date is eligible to collect a due window or count toward an exam. */
function isEslActiveDay(args: {
	date: string;
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	classId: string;
	period: number;
	type: EslClassType;
	cohortGrade: number;
}): boolean {
	const sameDay = args.events.filter(
		(event) =>
			event.date === args.date && eventReachesClass(event.target, args.type, args.cohortGrade)
	);
	if (sameDay.some((event) => event.type === 'off' || event.type === 'exam')) return false;
	if (sameDay.some((event) => event.type === 'no_class')) return false;
	const meeting = args.meetings.find(
		(m) =>
			m.classId === args.classId && weekdayOfDate(args.date) === m.day && m.period === args.period
	);
	if (!meeting) return false;
	const partial = sameDay.find((event) => event.type === 'partial');
	if (partial) {
		if (partial.startPeriod !== undefined && args.period < partial.startPeriod) return false;
		if (partial.endPeriod !== undefined && args.period > partial.endPeriod) return false;
	}
	return true;
}

/**
 * Resolve one row's status from the events reaching it. Precedence:
 * exam > off > no_class > partial-window > oral > teaching.
 */
function resolveEslDayStatus(args: {
	date: string;
	meeting: ScheduleMeetingInput;
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	exams: readonly ScheduleEventInput[];
}): { status: ScheduleDayStatus; cause: string | null; badges: string[] } {
	const dayEvents = args.events.filter(
		(event) =>
			event.date === args.date &&
			eventReachesClass(event.target, args.meeting.type, args.meeting.cohortGrade)
	);
	const exam = dayEvents.find((event) => event.type === 'exam');
	if (exam) return { status: 'exam', cause: exam.label, badges: [] };
	const off = dayEvents.find((event) => event.type === 'off');
	if (off) return { status: 'off', cause: off.label, badges: [] };
	const noClass = dayEvents.find((event) => event.type === 'no_class');
	if (noClass) return { status: 'no_class', cause: noClass.label, badges: [] };

	const partial = dayEvents.find((event) => event.type === 'partial');
	const outOfWindow =
		partial &&
		((partial.startPeriod !== undefined && args.meeting.period < partial.startPeriod) ||
			(partial.endPeriod !== undefined && args.meeting.period > partial.endPeriod));

	if (outOfWindow && partial) {
		return {
			status: 'partial',
			cause: partial.label,
			badges: [
				`out-of-window P${args.meeting.period} (window${partial.startPeriod !== undefined ? ` from P${partial.startPeriod}` : ''}${partial.endPeriod !== undefined ? ` to P${partial.endPeriod}` : ''})`
			]
		};
	}

	// Oral-exam marking: eligible classes only (no CLIL, no G10), and only the
	// latest active day before each reached exam.
	if (args.meeting.type !== 'CLIL' && args.meeting.cohortGrade !== 10) {
		for (const target of args.exams) {
			if (target.date <= args.date) continue;
			if (!eventReachesClass(target.target, args.meeting.type, args.meeting.cohortGrade)) continue;
			let laterActive = false;
			for (let later = nextEslDate(args.date); later < target.date; later = nextEslDate(later)) {
				if (
					isEslActiveDay({
						date: later,
						meetings: args.meetings,
						events: args.events,
						classId: args.meeting.classId,
						period: args.meeting.period,
						type: args.meeting.type,
						cohortGrade: args.meeting.cohortGrade
					})
				) {
					laterActive = true;
					break;
				}
			}
			if (!laterActive) {
				const badges = [`oral ahead of ${target.label}`];
				if (partial) return { status: 'oral_exam', cause: partial.label, badges };
				return {
					status: 'oral_exam',
					cause: `Oral exam ahead of ${target.label}`,
					badges
				};
			}
		}
	}

	if (partial) return { status: 'partial', cause: partial.label, badges: [] };
	return { status: 'teaching', cause: null, badges: [] };
}

/**
 * The graduation ceremony anchoring G9-in-S2 counts: the no_class+G9 event
 * whose label names it.
 */
function g9CeremonyOf(events: readonly ScheduleEventInput[]): ScheduleEventInput | null {
	const ceremony = events
		.filter(
			(event) =>
				event.type === 'no_class' &&
				event.target === 'G9' &&
				/graduation|ceremony/i.test(event.label)
		)
		.sort((a, b) => a.date.localeCompare(b.date))[0];
	return ceremony ?? null;
}

/** Count active meetings of one class inside `[from, to]`. */
function countEslActiveDays(args: {
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	classId: string;
	type: EslClassType;
	cohortGrade: number;
	from: string;
	to: string;
}): number {
	let total = 0;
	for (let cursor = args.from; cursor <= args.to; cursor = nextEslDate(cursor)) {
		const weekday = weekdayOfDate(cursor);
		if (weekday === null) continue;
		for (const meeting of args.meetings.filter(
			(m) => m.classId === args.classId && m.day === weekday
		)) {
			if (
				isEslActiveDay({
					date: cursor,
					meetings: args.meetings,
					events: args.events,
					classId: meeting.classId,
					period: meeting.period,
					type: args.type,
					cohortGrade: args.cohortGrade
				})
			) {
				total += 1;
			}
		}
	}
	return total;
}

/**
 * Build the teacher's day rows for a date range.
 *
 * Collapse: each ranged due (task_due/homework_due/quiz) lands once, on the
 * latest active class day inside its window; earlier occurrences are stripped
 * (dues only attach to the collapse target), and a window with no active day
 * lands nowhere. Count-ups run per term toward Exam 1 / Exam 2 / Final exam
 * as `Class k/n to <label>`, with G9-in-S2 anchored on the graduation
 * ceremony; rows past the final anchor carry no count (also the finals-TBD
 * state before any exam exists).
 */
export function buildTeacherDayRows(args: {
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	semesterStart: string;
	semesterEnd: string | null;
	term: EslSemesterTerm;
	fromDate: string;
	toDate: string;
}): ScheduleDayRow[] {
	const start = args.fromDate < args.semesterStart ? args.semesterStart : args.fromDate;
	const end =
		args.semesterEnd !== null && args.toDate > args.semesterEnd ? args.semesterEnd : args.toDate;
	if (end < start) return [];

	const exams = args.events
		.filter((event) => event.type === 'exam' && event.date >= args.semesterStart)
		.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
	const ceremony = args.term === 'S2' ? g9CeremonyOf(args.events) : null;
	const rows: ScheduleDayRow[] = [];
	for (let date = start; date <= end; date = nextEslDate(date)) {
		const weekday = weekdayOfDate(date);
		if (weekday === null) continue;
		for (const meeting of args.meetings.filter((m) => m.day === weekday)) {
			// G9 graduates at the ceremony: no meeting rows past it, same as
			// past the final exam (the derived window clamps there).
			if (meeting.type === 'G9' && ceremony && date > ceremony.date) continue;
			const { status, cause, badges } = resolveEslDayStatus({
				date,
				meeting,
				meetings: args.meetings,
				events: args.events,
				exams
			});

			let count: ScheduleDayRow['count'] = null;
			if (status === 'exam') {
				count = { position: 1, total: 1, label: cause ?? 'Exam' };
			} else if (status === 'off' || status === 'no_class') {
				count = null;
			} else if (meeting.type === 'G9' && ceremony && date <= ceremony.date) {
				const position = countEslActiveDays({
					meetings: args.meetings,
					events: args.events,
					classId: meeting.classId,
					type: meeting.type,
					cohortGrade: meeting.cohortGrade,
					from: args.semesterStart,
					to: date
				});
				const total = countEslActiveDays({
					meetings: args.meetings,
					events: args.events,
					classId: meeting.classId,
					type: meeting.type,
					cohortGrade: meeting.cohortGrade,
					from: args.semesterStart,
					to: ceremony.date
				});
				count = { position, total, label: ceremony.label };
			} else {
				const reached = exams.filter((exam) =>
					eventReachesClass(exam.target, meeting.type, meeting.cohortGrade)
				);
				// Past the last reached exam (or past the final with the G9
				// ceremony extending the window) no upcoming anchor remains:
				// the row stays, the count drops — post-final carries no count.
				const upcoming = reached.find((exam) => exam.date >= date);
				if (upcoming) {
					const beforeUpcoming = reached
						.filter((exam) => exam.date < upcoming.date)
						.sort((a, b) => a.date.localeCompare(b.date));
					const previous =
						beforeUpcoming.length > 0 ? beforeUpcoming[beforeUpcoming.length - 1] : undefined;
					const windowFromExclusive =
						previous && previous.date >= args.semesterStart ? previous.date : null;
					const windowFrom =
						windowFromExclusive === null ? args.semesterStart : nextEslDate(windowFromExclusive);
					const from = windowFrom <= date ? windowFrom : date;
					const position = countEslActiveDays({
						meetings: args.meetings,
						events: args.events,
						classId: meeting.classId,
						type: meeting.type,
						cohortGrade: meeting.cohortGrade,
						from,
						to: date
					});
					const total = countEslActiveDays({
						meetings: args.meetings,
						events: args.events,
						classId: meeting.classId,
						type: meeting.type,
						cohortGrade: meeting.cohortGrade,
						from: windowFrom,
						to: upcoming.date
					});
					count = { position, total, label: upcoming.label };
				}
			}

			rows.push({
				date,
				weekday,
				classId: meeting.classId,
				type: meeting.type,
				cohortGrade: meeting.cohortGrade,
				period: meeting.period,
				status,
				cause,
				badges,
				dues: [],
				count
			});
		}
	}

	for (const event of args.events) {
		if (event.type !== 'task_due' && event.type !== 'homework_due' && event.type !== 'quiz')
			continue;
		const windowEnd = event.endDate ?? event.date;
		for (const row of rows) {
			if (row.date < event.date || row.date > windowEnd) continue;
			if (!eventReachesClass(event.target, row.type, row.cohortGrade)) continue;
			if (
				!isEslActiveDay({
					date: row.date,
					meetings: args.meetings,
					events: args.events,
					classId: row.classId,
					period: row.period,
					type: row.type,
					cohortGrade: row.cohortGrade
				})
			)
				continue;
			const laterExists = rows.some(
				(other) =>
					other.classId === row.classId &&
					other.date > row.date &&
					other.date <= windowEnd &&
					eventReachesClass(event.target, other.type, other.cohortGrade) &&
					isEslActiveDay({
						date: other.date,
						meetings: args.meetings,
						events: args.events,
						classId: other.classId,
						period: other.period,
						type: other.type,
						cohortGrade: other.cohortGrade
					})
			);
			if (laterExists) continue;
			row.dues.push({
				label: event.label,
				type: event.type,
				windowStart: event.date,
				windowEnd
			});
			row.badges.push(
				event.endDate && event.endDate !== event.date
					? `due window ${event.date}–${event.endDate}`
					: 'due'
			);
		}
	}

	rows.sort(compareDayRows);
	return rows;
}

// ============================================================================
// Seed-service math
// ============================================================================

/** Weekday counts per exam range. */
export const EXAM_SEED_WEEKDAYS: Readonly<Record<string, number>> = {
	'Exam 1': 2,
	'Exam 2': 2,
	'Final exam': 3
};

/** G9 mocks are fixed two-day ranges. */
export const G9_MOCK_SEED_DAYS = 2;

/** The suggested end of an exam range. */
export function suggestExamEndDate(startDate: string, weekdayCount: number): string {
	let end = startDate;
	let counted = 1;
	while (counted < weekdayCount) {
		end = nextEslDate(end);
		if (weekdayOfDate(end) !== null) counted += 1;
	}
	return end;
}

/** The weekday dates of an inclusive range. */
export function weekdayDatesBetween(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	for (let date = startDate; date <= endDate; date = nextEslDate(date)) {
		if (weekdayOfDate(date) !== null) dates.push(date);
	}
	return dates;
}

/** The Friday before a date. */
export function fridayBeforeDate(date: string): string {
	let candidate = prevEslDate(date);
	while (weekdayOfDate(candidate) !== 'Friday') {
		candidate = prevEslDate(candidate);
	}
	return candidate;
}

/** Whether a seeded row is protected against deletion: exams + ceremony. */
export function isProtectedSeedEvent(event: {
	type: EslEventType;
	label: string;
	target?: EslEventTarget;
}): boolean {
	if (event.type === 'exam') return true;
	return (
		event.type === 'no_class' && event.target === 'G9' && /graduation|ceremony/i.test(event.label)
	);
}

// ============================================================================
// Holiday cache types
// ============================================================================

/** One Taiwan-Calendar day row. */
export type TaiwanCalendarDayRow = {
	date: string;
	isHoliday: boolean;
	caption: string;
};

/** Read an API `YYYYMMDD` date as `YYYY-MM-DD`. */
function normalizeHolidayDate(date: string): string {
	const digits = date.replace(/-/g, '');
	if (/^\d{8}$/.test(digits)) {
		return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
	}
	return date;
}

/** The off-day dates of one lunar festival with their captions. */
export function findLunarOffDays(
	dayRows: readonly TaiwanCalendarDayRow[],
	festivalCaption: string
): { date: string; caption: string }[] {
	const normalized = dayRows
		.map((row) => ({
			date: normalizeHolidayDate(row.date),
			isHoliday: row.isHoliday,
			caption: row.caption
		}))
		.sort((a, b) => a.date.localeCompare(b.date));
	const runs: { date: string; caption: string }[][] = [];
	for (const row of normalized) {
		if (!row.isHoliday) continue;
		const current = runs[runs.length - 1];
		const previous = current?.[current.length - 1];
		if (current && previous && nextEslDate(previous.date) === row.date) {
			current.push(row);
		} else {
			runs.push([row]);
		}
	}
	return runs
		.filter((run) => run.some((row) => row.caption.includes(festivalCaption)))
		.flatMap((run) => run.map((row) => ({ date: row.date, caption: row.caption })));
}

/** The off-day dates of one lunar festival (captions dropped). */
export function findLunarOffCluster(
	dayRows: readonly TaiwanCalendarDayRow[],
	festivalCaption: string
): string[] {
	return findLunarOffDays(dayRows, festivalCaption).map((row) => row.date);
}

// ============================================================================
// Legacy repair utilities
// ============================================================================

/** Normalize legacy level names to official names. */
export function normalizeEslLevel(level: string): EslLevel | null {
	const map: Record<string, EslLevel> = {
		'Pre-Ele': 'Pre-Ele',
		Ele: 'Elementary',
		Basic: 'Basic',
		Int: 'Intermediate',
		Adv: 'Advanced',
		'Pre-Elementary': 'Pre-Ele',
		Elementary: 'Elementary',
		Intermediate: 'Intermediate',
		Advanced: 'Advanced'
	};
	return map[level] ?? null;
}

/** Plan the rewrite of cohort levels stored under the old short vocabulary. */
export function planLegacyLevelRepair(cohorts: readonly { _id: string; level?: string }[]): {
	cohorts: { id: string; level: EslLevel }[];
} {
	const patches: { id: string; level: EslLevel }[] = [];
	for (const cohort of cohorts) {
		if (cohort.level === undefined) continue;
		if (isEslLevel(cohort.level)) continue;
		const normalized = normalizeEslLevel(cohort.level);
		if (normalized === null) continue;
		patches.push({ id: cohort._id, level: normalized });
	}
	return { cohorts: patches };
}

/** Plan the repair for rows written before the grade 10 model was corrected. */
export function planLegacyGrade10Repair(
	cohorts: readonly { _id: string; grade: number; classNumber: string; level?: string }[],
	classes: readonly { _id: string; cohortId: string; type: string; name: string }[]
): {
	cohorts: { id: string; level: undefined; classNumber: string }[];
	classes: { id: string; type: 'H10A'; name: string }[];
} {
	const cohortPatches: { id: string; level: undefined; classNumber: string }[] = [];
	for (const cohort of cohorts) {
		if (cohort.grade !== 10) continue;
		if (cohort.level !== undefined) {
			cohortPatches.push({
				id: cohort._id,
				level: undefined,
				classNumber: grade10BaseClass(cohort.classNumber)
			});
		}
	}

	const classPatches: { id: string; type: 'H10A'; name: string }[] = [];
	for (const row of classes) {
		if (row.type !== 'H10') continue;
		const cohort = cohorts.find((c) => c._id === row.cohortId);
		classPatches.push({
			id: row._id,
			type: 'H10A',
			name: cohort ? grade10ClassName(grade10BaseClass(cohort.classNumber), 'H10A') : row.name
		});
	}

	return { cohorts: cohortPatches, classes: classPatches };
}

/** Extract base class number from grade 10 class number (zero-padded). */
function grade10BaseClass(classNumber: string): string {
	return classNumber.padStart(2, '0');
}

/** Grade 10 class name from base class and section. */
function grade10ClassName(classNumber: string, type: 'H10A' | 'H10B'): string {
	return `H1${classNumber}${type === 'H10A' ? 'A' : 'B'}`;
}

/** Sort key for cohorts. */
export function compareEslCohorts(
	a: { grade: number; level?: string; classNumber: string },
	b: { grade: number; level?: string; classNumber: string }
): number {
	if (a.grade !== b.grade) return a.grade - b.grade;

	if (!isLevelledGrade(a.grade)) {
		const byClass = a.classNumber.localeCompare(b.classNumber);
		return byClass !== 0 ? byClass : grade10SectionRank(a.level) - grade10SectionRank(b.level);
	}

	const byLevel = levelRank(a.level) - levelRank(b.level);
	return byLevel !== 0 ? byLevel : a.classNumber.localeCompare(b.classNumber);
}

function levelRank(level: string | undefined): number {
	if (!level) return ESL_LEVELS.length;
	const asLevel = ESL_LEVELS.indexOf(level as EslLevel);
	if (asLevel !== -1) return asLevel;
	if (isGrade10Level(level)) return ESL_GRADE10_LEVELS.length - ESL_GRADE10_LEVELS.indexOf(level);
	return ESL_LEVELS.length;
}

function grade10SectionRank(level: string | undefined): number {
	if (!level) return ESL_GRADE10_LEVELS.length;
	const index = ESL_GRADE10_LEVELS.indexOf(level as EslGrade10Level);
	return index === -1 ? ESL_GRADE10_LEVELS.length : index;
}

/** The other section of a grade 10 Chinese class: `A` ↔ `B`. */
export function grade10SiblingLevel(level: string | undefined): EslGrade10Level | null {
	if (!level) return null;
	const index = ESL_GRADE10_LEVELS.indexOf(level as EslGrade10Level);
	if (index === -1) return null;
	return ESL_GRADE10_LEVELS[ESL_GRADE10_LEVELS.length - 1 - index] ?? null;
}

/** Default class name for a cohort. */
export function defaultClassName(cohort: EslCohortKey, type: EslClassType): string {
	if (!isLevelledGrade(cohort.grade)) {
		return grade10ClassName(grade10BaseClass(cohort.classNumber), type as 'H10A' | 'H10B');
	}
	const lesson = classNameLesson(type);
	return `G${cohort.grade} ${cohort.level} ${cohort.classNumber}${lesson ? ` ${lesson}` : ''}`;
}

function classNameLesson(type: EslClassType): string {
	if (type === 'CLIL') return 'CLIL';
	if (type === 'Comm') return 'Comm';
	if (type === 'G9') return '';
	return '';
}

/** Cohort label for display. */
export function cohortLabel(cohort: EslCohortKey): string {
	if (!isLevelledGrade(cohort.grade)) {
		const level = cohort.level ?? '';
		return `${cohort.year} G${cohort.grade} H1${grade10BaseClass(cohort.classNumber)}${level}`;
	}
	return `${cohort.year} G${cohort.grade} ${cohort.level} ${cohort.classNumber}`;
}

/** Cohort code for identity. */
export function cohortCode(cohort: EslCohortKey): string {
	if (!isLevelledGrade(cohort.grade)) {
		return `G${cohort.grade}-${grade10BaseClass(cohort.classNumber)}${cohort.level ?? ''}`;
	}
	return `G${cohort.grade}-${cohort.level}-${cohort.classNumber}`;
}

/**
 * Short label for an ESL class, used in calendar views and schedule lists.
 * G7–G9: `G<grade> <short-level> <class-number>` (e.g., `G7 Pre. 1`, `G8 Ele. 3`, `G9 Bas. 3`)
 * G10: `H1nnA/B` verbatim (e.g., `H101A`, `H112B`, `H110A`)
 * No trailing grade token duplication.
 */
export function eslClassShortLabel(args: {
	grade: number;
	level?: string;
	classNumber: string;
	type: EslClassType;
}): string {
	if (!isLevelledGrade(args.grade)) {
		const base = `H1${args.classNumber.padStart(2, '0')}`;
		const section = grade10SectionOf(args.type);
		return section ? `${base}${section}` : base;
	}

	const shortLevel = shortLevelLabel(args.level ?? '');
	const parts = [`G${args.grade}`, shortLevel, args.classNumber].filter(Boolean);
	return parts.join(' ');
}

function shortLevelLabel(level: string): string {
	switch (level) {
		case 'Pre-Ele':
			return 'Pre.';
		case 'Elementary':
			return 'Ele.';
		case 'Basic':
			return 'Bas.';
		case 'Intermediate':
			return 'Int.';
		case 'Advanced':
			return 'Adv.';
		default:
			return level;
	}
}

/** School year validation. */
export function isValidSchoolYear(year: string): boolean {
	return /^\d{4}-\d{4}$/.test(year);
}

/** Derive semester end from exam dates. */
export function deriveSemesterEnd(examDates: readonly string[]): string | null {
	if (examDates.length === 0) return null;
	return examDates.reduce((max, date) => (date > max ? date : max));
}

/** Default room suggestions. */
export const ESL_ROOM_SUGGESTIONS = [
	'ESL A',
	'ESL B',
	'ESL C',
	'ESL D',
	'ESL E',
	'ESL F',
	'ESL G'
] as const;
