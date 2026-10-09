// ⚠️ PROTOTYPE — throwaway, do not ship. Fixture + join logic for the
// per-class custom calendar prototype (map #178, ticket #188).
// Encodes the settled geometry (#186): one calendar per class, school-week
// rows of meeting-date cards, hidden non-meetings, row-span banners,
// split-month fragments with repeated week numbers, clamped navigation.
// Teacher notes are stubbed (in-memory only); the notes model lives in #187.

import { eslPeriodTimes } from '$convex/shared/esl';

export type Target = 'all' | 'CLIL' | 'Comm' | 'G9';
export type EventType =
	| 'task_due'
	| 'homework_due'
	| 'quiz'
	| 'off'
	| 'no_class'
	| 'partial'
	| 'exam'
	| 'start_school';

export interface ProtoClass {
	id: string;
	/** e.g. G7 Elementary 1 CLIL */
	name: string;
	/** e.g. G7 Ele. 1 */
	short: string;
	type: 'CLIL' | 'Comm';
	room: string;
	headcount: number;
	meetings: { weekday: number; period: number }[];
}

export interface CalEvent {
	id: string;
	type: EventType;
	title: string;
	target: Target;
	start: string;
	end: string;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
}

export type MeetingStatus = 'teaching' | 'off' | 'no_class' | 'exam' | 'oral';

export interface DateCard {
	date: string;
	weekdayName: string;
	period: number;
	time: string;
	status: MeetingStatus;
	/** greyed-cancelled cause, e.g. the off/no-class/exam event title */
	cause: string | null;
	countdown: string | null;
	badges: string[];
	note: string | null;
	/** wall-clock relative shading (prototype runs inside its fixture window) */
	past: boolean;
	isToday: boolean;
}

export interface WeekFragment {
	weekIndex: number;
	year: number;
	month: number;
	/** e.g. Sep, or Sep–Oct when the week straddles months */
	monthLabel: string;
	cards: DateCard[];
	banners: { title: string; start: string; end: string }[];
}

export const CLASSES: ProtoClass[] = [
	{
		id: 'clil',
		name: 'G7 Elementary 1 CLIL',
		short: 'G7 Ele 1',
		type: 'CLIL',
		room: 'ESL C',
		headcount: 25,
		// Monday P6 sits outside the BBQ partial window (P1–P4) on purpose:
		// it demonstrates the settled show-all + outside-badge rule.
		meetings: [
			{ weekday: 1, period: 6 },
			{ weekday: 3, period: 3 },
			{ weekday: 5, period: 4 }
		]
	},
	{
		id: 'comm',
		name: 'G7 Elementary 1 Comm',
		short: 'G7 Ele 1',
		type: 'Comm',
		room: 'ESL D',
		headcount: 25,
		meetings: [
			{ weekday: 2, period: 5 },
			{ weekday: 4, period: 6 }
		]
	}
];

/** Clamped navigation window: Sept–Oct 2026 of S1 (S2 lives elsewhere). */
export const MONTHS = [
	{ year: 2026, month: 9 },
	{ year: 2026, month: 10 }
];

const EVENTS: CalEvent[] = [
	{
		id: 'pass1',
		type: 'task_due',
		title: 'Passport 1 due',
		target: 'Comm',
		start: '2026-09-14',
		end: '2026-09-18',
		note: 'Collect for department check'
	},
	{
		id: 'bbq',
		type: 'partial',
		title: 'Moon Festival BBQ',
		target: 'all',
		start: '2026-09-21',
		end: '2026-09-21',
		endPeriod: 4,
		note: 'BBQ from 12:00, afternoon off'
	},
	{
		id: 'rec1',
		type: 'homework_due',
		title: 'Recording Homework 1 due',
		target: 'Comm',
		start: '2026-09-21',
		end: '2026-09-25'
	},
	{
		id: 'quiz1',
		type: 'quiz',
		title: 'Unit 1 test due',
		target: 'CLIL',
		start: '2026-09-21',
		end: '2026-09-25'
	},
	{
		id: 'moon',
		type: 'off',
		title: 'Moon Festival',
		target: 'all',
		start: '2026-09-25',
		end: '2026-09-25'
	},
	{
		id: 'teachers',
		type: 'off',
		title: "Teacher's Day",
		target: 'all',
		start: '2026-09-28',
		end: '2026-09-28'
	},
	{
		id: 'sports',
		type: 'no_class',
		title: "Sport's Day",
		target: 'all',
		start: '2026-10-09',
		end: '2026-10-09'
	},
	{
		id: 'exam1',
		type: 'exam',
		title: 'Exam 1',
		target: 'all',
		start: '2026-10-14',
		end: '2026-10-15'
	},
	{
		id: 'exam2',
		type: 'exam',
		title: 'Exam 2',
		target: 'all',
		start: '2026-12-02',
		end: '2026-12-03'
	},
	{
		id: 'final',
		type: 'exam',
		title: 'Final exam',
		target: 'all',
		start: '2027-01-18',
		end: '2027-01-20'
	}
];

const DUE_TYPES: EventType[] = ['task_due', 'homework_due', 'quiz'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = [
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
];
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

/** Full month name for a YYYY-MM key, e.g. monthName('2026-11') → November. */
export function monthName(ym: string): string {
	return MONTH_FULL[Number(ym.slice(5, 7)) - 1] ?? ym;
}
const SEMESTER_START = '2026-08-31';
/**
 * Semester window end: the last day of the final exam. After the final
 * exam there are no classes, so no cards — never countless post-exam rows.
 * (G9 in S2 is the exception: classes run to graduation, so its window
 * extends to the ceremony date. Build rule, #181.)
 */
const SEMESTER_END: string = EVENTS.filter((e) => e.type === 'exam')
	.map((e) => e.end)
	.sort()
	.pop() as string;
/** Numbered exams in term order; each anchors its own count-up term. */
const EXAMS: CalEvent[] = EVENTS.filter((e) => e.type === 'exam').sort((a, b) =>
	a.start < b.start ? -1 : 1
);

/** Wall-clock today. The fixture window (Sept–Oct 2026) contains it; past
 * shading is illustrative once the semester ends — the build needs a real
 * semester-aware "today" (schoolYearOf + derived end), not this. */
export const TODAY = (() => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
})();

function toDay(date: string): Date {
	return new Date(date + 'T12:00:00');
}

function iso(day: Date): string {
	return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function weekIndexOf(date: string): number {
	return Math.floor((toDay(date).getTime() - toDay(SEMESTER_START).getTime()) / (7 * 86400000)) + 1;
}

function groupMatches(target: Target, cls: ProtoClass): boolean {
	return target === 'all' || target === cls.type;
}

function meetingDates(cls: ProtoClass, from: string, to: string): string[] {
	const weekdays = cls.meetings.map((m) => m.weekday);
	const out: string[] = [];
	const cursor = toDay(from);
	while (iso(cursor) <= to) {
		const d = iso(cursor);
		if (weekdays.includes(toDay(d).getDay())) out.push(d);
		cursor.setDate(cursor.getDate() + 1);
	}
	return out;
}

function buildForClass(cls: ProtoClass): Map<string, DateCard[]> {
	const offExam = new Set<string>();
	for (const e of EVENTS) {
		if (e.type !== 'off' && e.type !== 'exam') continue;
		const cursor = toDay(e.start);
		while (iso(cursor) <= e.end) {
			offExam.add(iso(cursor));
			cursor.setDate(cursor.getDate() + 1);
		}
	}

	const collapsed = new Map<string, string | null>();
	for (const e of EVENTS.filter((e) => DUE_TYPES.includes(e.type))) {
		if (!groupMatches(e.target, cls)) {
			collapsed.set(e.id, null);
			continue;
		}
		const cands = meetingDates(cls, e.start, e.end).filter((d) => !offExam.has(d));
		collapsed.set(e.id, cands.length > 0 ? cands[cands.length - 1] : null);
	}

	// Oral-exam meetings: two latest pre-exam dates per exam, CLIL skipped
	// (settled exception, carried over from the scheduler per term).
	const oral = new Set<string>();
	if (cls.type !== 'CLIL') {
		for (const exam of EXAMS) {
			const pre = meetingDates(cls, SEMESTER_START, exam.start).filter((d) => d < exam.start);
			for (const d of pre.slice(-2)) oral.add(d);
		}
	}

	const byDate = new Map<string, DateCard[]>();
	for (const date of meetingDates(cls, SEMESTER_START, SEMESTER_END)) {
		const on = (e: CalEvent) => date >= e.start && date <= e.end;
		const off = EVENTS.find((e) => e.type === 'off' && on(e)) ?? null;
		const noClass = EVENTS.filter(
			(e) => e.type === 'no_class' && on(e) && groupMatches(e.target, cls)
		);
		const exams = EVENTS.filter((e) => e.type === 'exam' && on(e));
		const partial =
			EVENTS.find((e) => e.type === 'partial' && on(e) && groupMatches(e.target, cls)) ?? null;
		const rows: DateCard[] = cls.meetings
			.filter((m) => m.weekday === toDay(date).getDay())
			.map((m) => {
				const times = eslPeriodTimes(m.period);
				const badges: string[] = [];
				let status: MeetingStatus = 'teaching';
				let cause: string | null = null;
				if (off) {
					status = 'off';
					cause = off.title;
				} else if (exams.length > 0) {
					status = 'exam';
					cause = exams[0].title;
				} else if (noClass.length > 0) {
					status = 'no_class';
					cause = noClass[0].title;
				} else if (oral.has(date)) {
					status = 'oral';
					badges.push('Oral Exam');
				}
				if (partial) {
					const lo = partial.startPeriod ?? 1;
					const hi = partial.endPeriod ?? 8;
					badges.push(
						m.period < lo || m.period > hi ? `Outside P${lo}–P${hi}` : `Partial P${lo}–P${hi}`
					);
				}
				for (const e of EVENTS.filter((e) => DUE_TYPES.includes(e.type))) {
					if (collapsed.get(e.id) === date) badges.push(`${e.title} · ${e.start}–${e.end}`);
				}
				// Count-UP per term: each numbered exam anchors its own term.
				// Elapsed sessions including this one (1/19 → 19/19 at the
				// exam). Null once no later exam exists: the semester ends on
				// the final exam, so post-exam meetings have no count.
				// (G9 in S2 counts to graduation instead — build rule, #181.)
				const target = EXAMS.find((e) => e.start > date) ?? null;
				let count: string | null = null;
				if (target && (status === 'teaching' || status === 'oral')) {
					const prevEnd =
						[...EXAMS].filter((e) => e.end < target.start).pop()?.end ?? SEMESTER_START;
					const term = meetingDates(cls, prevEnd, target.start).filter(
						(d) => (d > prevEnd || prevEnd === SEMESTER_START) && d < target.start
					);
					const elapsed = term.filter((d) => d <= date).length;
					count = `Class ${elapsed}/${term.length} to ${target.title}`;
				}
				return {
					date,
					weekdayName: WEEKDAYS[toDay(date).getDay()],
					period: m.period,
					time: times ? `${times.start}–${times.end}` : `P${m.period}`,
					status,
					cause,
					countdown: count,
					badges,
					note: null,
					past: date < TODAY,
					isToday: date === TODAY
				};
			});
		byDate.set(date, rows);
	}
	return byDate;
}

const CACHE = new Map<string, Map<string, DateCard[]>>();

/** First meeting date on or after today: the "closest class day" marker. */
export function nextDate(cls: ProtoClass): string | null {
	for (const date of [...cardsFor(cls).keys()].sort()) {
		if (date >= TODAY) return date;
	}
	return null;
}

/** Latest meeting date strictly before today: the "what was taught last" jump. */
export function prevDate(cls: ProtoClass): string | null {
	const past = [...cardsFor(cls).keys()].sort().filter((d) => d < TODAY);
	return past.length > 0 ? past[past.length - 1] : null;
}

export function cardsFor(cls: ProtoClass): Map<string, DateCard[]> {
	let hit = CACHE.get(cls.id);
	if (!hit) {
		hit = buildForClass(cls);
		CACHE.set(cls.id, hit);
	}
	return hit;
}

/** Week fragments for one month: split weeks appear per month with own days only. */
export function fragmentsFor(cls: ProtoClass, year: number, month: number): WeekFragment[] {
	const byDate = cardsFor(cls);
	const daysInMonth = new Date(year, month, 0).getDate();
	const groups = new Map<number, DateCard[]>();
	for (let d = 1; d <= daysInMonth; d++) {
		const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		const rows = byDate.get(date);
		if (!rows || rows.length === 0) continue;
		const w = weekIndexOf(date);
		if (!groups.has(w)) groups.set(w, []);
		groups.get(w)?.push(...rows);
	}
	const frags: WeekFragment[] = [...groups.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([weekIndex, cards]) => {
			const dates = cards.map((c) => c.date).sort();
			const banners = EVENTS.filter(
				(e) =>
					DUE_TYPES.includes(e.type) &&
					groupMatches(e.target, cls) &&
					e.start <= dates[dates.length - 1] &&
					e.end >= dates[0]
			).map((e) => ({ title: e.title, start: e.start, end: e.end }));
			return { weekIndex, year, month, monthLabel: MONTH_SHORT[month - 1], cards, banners };
		});
	return frags;
}

/**
 * Whole-semester week rows, keyed by school week (no month splits, so no card
 * ever renders twice). Month rides on the rail as context instead.
 */
export function semesterFragments(cls: ProtoClass): WeekFragment[] {
	const byDate = cardsFor(cls);
	const groups = new Map<number, DateCard[]>();
	for (const [date, rows] of [...byDate.entries()].sort()) {
		const w = weekIndexOf(date);
		if (!groups.has(w)) groups.set(w, []);
		groups.get(w)?.push(...rows);
	}
	return [...groups.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([weekIndex, cards]) => {
			const dates = cards.map((c) => c.date).sort();
			const months = [...new Set(dates.map((d) => Number(d.slice(5, 7))))];
			const banners = EVENTS.filter(
				(e) =>
					DUE_TYPES.includes(e.type) &&
					groupMatches(e.target, cls) &&
					e.start <= dates[dates.length - 1] &&
					e.end >= dates[0]
			).map((e) => ({ title: e.title, start: e.start, end: e.end }));
			const [y, m] = dates[0].split('-').map(Number);
			return {
				weekIndex,
				year: y,
				month: m,
				monthLabel: months.map((mm) => MONTH_SHORT[mm - 1]).join('–'),
				cards,
				banners
			};
		});
}

/** Collapse decisions, for the state surface. */
export function collapseSummary(cls: ProtoClass): Record<string, string | null> {
	const byDate = cardsFor(cls);
	const out: Record<string, string | null> = {};
	for (const e of EVENTS.filter((e) => DUE_TYPES.includes(e.type))) {
		let found: string | null = null;
		for (const [date, rows] of byDate) {
			if (rows.some((r) => r.badges.some((b) => b.startsWith(e.title)))) found = date;
		}
		out[`${e.title} [${e.start}–${e.end}]`] = found;
	}
	return out;
}
