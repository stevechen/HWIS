// ⚠️ PROTOTYPE — throwaway, do not ship. Fixture + join logic for the
// teacher semester list-view prototype (map #178, ticket #182).
// Encodes the settled effects matrix (#181) in the dumbest runnable form:
// single-select targets, collapse-to-latest dues with off-wins, shown-not-hidden
// partials, as-is exams, oral-exam with the CLIL skip, per-group countdowns.

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

export type ClassGroup = 'CLIL-2' | 'Comm-1' | 'G9-1';

export interface Meeting {
	group: ClassGroup;
	/** Monday = 1 … Friday = 5 */
	weekday: number;
	period: number;
	room: string;
}

export interface CalEvent {
	id: string;
	type: EventType;
	title: string;
	target: Target;
	/** inclusive YYYY-MM-DD range */
	start: string;
	end: string;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
}

export type MeetingStatus = 'teaching' | 'off' | 'no_class' | 'exam' | 'oral';

export interface MeetingRow extends Meeting {
	time: string;
	status: MeetingStatus;
	/** badges like the due-window, partial marks, oral tag */
	badges: string[];
	/** sessions-remaining / sessions-total before Exam 1, null off the countdown */
	countdown: string | null;
}

export interface DayRow {
	date: string;
	weekdayName: string;
	/** school week number counted from the semester start */
	weekIndex: number;
	off: CalEvent | null;
	noClass: CalEvent[];
	exams: CalEvent[];
	partial: CalEvent | null;
	startSchool: CalEvent | null;
	meetings: MeetingRow[];
	notes: string[];
}

export const TEACHER = 'Ms. Rivera';
export const SEMESTER = 'S1 2026–2027';

const MEETINGS: Meeting[] = [
	{ group: 'CLIL-2', weekday: 1, period: 3, room: '301' },
	{ group: 'CLIL-2', weekday: 3, period: 3, room: '301' },
	{ group: 'Comm-1', weekday: 2, period: 5, room: '205' },
	{ group: 'Comm-1', weekday: 4, period: 6, room: '205' },
	{ group: 'G9-1', weekday: 1, period: 6, room: '118' },
	{ group: 'G9-1', weekday: 5, period: 4, room: '118' }
];

const GROUP_OF: Record<string, ClassGroup> = { CLIL: 'CLIL-2', Comm: 'Comm-1', G9: 'G9-1' };

function groupMatches(target: Target, group: ClassGroup): boolean {
	return target === 'all' || GROUP_OF[target] === group;
}

export const EVENTS: CalEvent[] = [
	{
		id: 'start',
		type: 'start_school',
		title: 'First day of S1',
		target: 'all',
		start: '2026-08-31',
		end: '2026-08-31',
		startPeriod: 3,
		note: 'Classes start from period 3'
	},
	{
		id: 'g9mock1',
		type: 'no_class',
		title: 'G9 Mock Exam',
		target: 'G9',
		start: '2026-09-10',
		end: '2026-09-11'
	},
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
		end: '2026-10-09',
		note: 'Deletable seed — no Sport\u2019s Day in 2027'
	},
	{
		id: 'exam1',
		type: 'exam',
		title: 'Exam 1',
		target: 'all',
		start: '2026-10-14',
		end: '2026-10-15'
	}
];

const DUE_TYPES: EventType[] = ['task_due', 'homework_due', 'quiz'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toDay(date: string): Date {
	return new Date(date + 'T12:00:00');
}

function iso(day: Date): string {
	return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function eachDate(from: string, to: string): string[] {
	const out: string[] = [];
	const cursor = toDay(from);
	while (iso(cursor) <= to) {
		out.push(iso(cursor));
		cursor.setDate(cursor.getDate() + 1);
	}
	return out;
}

/** First exam date in the fixture (anchors countdowns + oral-exam search). */
export const FIRST_EXAM = EVENTS.filter((e) => e.type === 'exam')
	.map((e) => e.start)
	.sort()[0];

function meetingDates(group: ClassGroup, from: string, to: string): string[] {
	const weekdays = MEETINGS.filter((m) => m.group === group).map((m) => m.weekday);
	return eachDate(from, to).filter((d) => weekdays.includes(toDay(d).getDay()));
}

/**
 * Collapse date for a due-range: the latest date in range that hosts a meeting
 * of an affected group on a day that is neither off nor exam. Earlier
 * occurrences are stripped (list rule); the calendar band is the full range.
 */
function collapseDate(event: CalEvent, offExamDates: Set<string>): string | null {
	const affected = (Object.keys(GROUP_OF) as Target[]).filter(
		(t) => event.target === 'all' || t === event.target
	);
	const candidates = new Set<string>();
	for (const t of affected) {
		for (const d of meetingDates(GROUP_OF[t], event.start, event.end)) {
			if (!offExamDates.has(d)) candidates.add(d);
		}
	}
	return [...candidates].sort().pop() ?? null;
}

export function buildDays(): DayRow[] {
	const from = '2026-08-31';
	const to = '2026-10-16';
	const dates = eachDate(from, to);

	const offExamDates = new Set<string>();
	for (const e of EVENTS) {
		if (e.type !== 'off' && e.type !== 'exam') continue;
		for (const d of eachDate(e.start, e.end)) offExamDates.add(d);
	}

	// Due-range collapse decisions (the interesting state — surfaced in <details>).
	const collapsed = new Map<string, string | null>();
	for (const e of EVENTS.filter((e) => DUE_TYPES.includes(e.type))) {
		collapsed.set(e.id, collapseDate(e, offExamDates));
	}

	// Oral-exam meetings: two latest pre-exam meetings per group, CLIL skipped.
	const oral = new Set<string>();
	const GROUPS: ClassGroup[] = ['CLIL-2', 'Comm-1', 'G9-1'];
	for (const group of GROUPS) {
		if (group === 'CLIL-2') continue;
		const pre = meetingDates(group, from, FIRST_EXAM).filter((d) => d < FIRST_EXAM);
		for (const d of pre.slice(-2)) oral.add(`${d}|${group}`);
	}

	// Countdowns: per group, sessions from window start up to (not incl.) Exam 1.
	const totals = new Map<ClassGroup, number>();
	for (const group of GROUPS) {
		totals.set(group, meetingDates(group, from, FIRST_EXAM).length);
	}

	return dates.map((date) => {
		const day = toDay(date);
		const weekday = day.getDay();
		const weekIndex = Math.floor((day.getTime() - toDay(from).getTime()) / (7 * 86400000)) + 1;
		const on = (e: CalEvent) => date >= e.start && date <= e.end;

		const off = EVENTS.find((e) => e.type === 'off' && on(e)) ?? null;
		const noClass = EVENTS.filter((e) => e.type === 'no_class' && on(e));
		const exams = EVENTS.filter((e) => e.type === 'exam' && on(e));
		const partial = EVENTS.find((e) => e.type === 'partial' && on(e)) ?? null;
		const startSchool = EVENTS.find((e) => e.type === 'start_school' && on(e)) ?? null;

		const meetings: MeetingRow[] = MEETINGS.filter((m) => m.weekday === weekday).map((m) => {
			const times = eslPeriodTimes(m.period);
			const badges: string[] = [];
			let status: MeetingStatus = 'teaching';
			if (off) status = 'off';
			else if (exams.length > 0) status = 'exam';
			else if (noClass.some((e) => groupMatches(e.target, m.group))) status = 'no_class';
			else if (oral.has(`${date}|${m.group}`)) {
				status = 'oral';
				badges.push('Oral Exam');
			}
			// Partial windows: true partials, plus start-day rows that carry bounds
			// (the S1 start day *is* a "starts from P3" partial in the data files).
			const windowEvent =
				partial ??
				(startSchool !== null &&
				(startSchool.startPeriod !== undefined || startSchool.endPeriod !== undefined)
					? startSchool
					: null);
			if (windowEvent && groupMatches(windowEvent.target, m.group)) {
				const lo = windowEvent.startPeriod ?? 1;
				const hi = windowEvent.endPeriod ?? 8;
				const out = m.period < lo || m.period > hi;
				badges.push(out ? `Outside partial window (P${lo}–P${hi})` : `Partial day P${lo}–P${hi}`);
			}
			for (const e of EVENTS.filter((e) => DUE_TYPES.includes(e.type))) {
				if (collapsed.get(e.id) === date && groupMatches(e.target, m.group)) {
					badges.push(`${e.title} · window ${e.start}–${e.end}`);
				}
			}
			const total = totals.get(m.group) ?? 0;
			const remaining = meetingDates(m.group, date, FIRST_EXAM).filter(
				(d) => d < FIRST_EXAM
			).length;
			return {
				...m,
				time: times ? `${times.start}–${times.end}` : `P${m.period}`,
				status,
				badges,
				countdown: status === 'teaching' || status === 'oral' ? `${remaining}/${total}` : null
			};
		});

		const notes: string[] = [];
		if (startSchool?.note) notes.push(startSchool.note);
		if (partial?.note) notes.push(partial.note);
		for (const e of EVENTS.filter((e) => DUE_TYPES.includes(e.type))) {
			if (collapsed.get(e.id) === date && e.note) notes.push(e.note);
		}

		return {
			date,
			weekdayName: WEEKDAYS[weekday],
			weekIndex,
			off,
			noClass,
			exams,
			partial,
			startSchool,
			meetings,
			notes
		};
	});
}

/** Collapse decisions, for the state surface. */
export function collapseSummary(): Record<string, string | null> {
	const offExam = new Set<string>();
	for (const e of EVENTS) {
		if (e.type !== 'off' && e.type !== 'exam') continue;
		for (const d of eachDate(e.start, e.end)) offExam.add(d);
	}
	const out: Record<string, string | null> = {};
	for (const e of EVENTS.filter((e) => DUE_TYPES.includes(e.type))) {
		out[`${e.title} [${e.start}–${e.end}]`] = collapseDate(e, offExam);
	}
	return out;
}
