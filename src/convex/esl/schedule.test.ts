import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, mockAuthUser, seedEslStaff } from '../test.setup';
import type { ConvexTestInstance } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';
import type { ScheduleDayRow } from '../shared/esl';

const YEAR = '2025-2026';

/**
 * The setup every slice shares: an S1 semester starting Sunday 2025-08-31, a
 * G7 cohort whose CLIL class (Mon P1 / Wed P2 / Fri P3) belongs to the teacher,
 * and whose Comm class belongs to someone else.
 */
async function setupTeacherWorld() {
	const t = convexTest(schema, modules);
	await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
	const teacherId = await seedEslStaff(t, {
		authId: 'esl-teacher',
		eslRole: 'teacher',
		signIn: false
	});
	const otherId = await seedEslStaff(t, {
		authId: 'esl-other',
		eslRole: 'teacher',
		signIn: false
	});
	const semesterId = await t.mutation(api.esl.semesters.create, {
		year: YEAR,
		term: 'S1',
		startDate: '2025-08-31'
	});
	const { classIds } = await t.mutation(api.esl.cohorts.create, {
		year: YEAR,
		grade: 7,
		level: 'Basic',
		classNumber: '1'
	});
	const [clilId, commId] = classIds;
	await t.mutation(api.esl.classes.setSchedule, {
		classId: clilId,
		year: YEAR,
		meetings: [
			{ day: 'Monday', period: 1 },
			{ day: 'Wednesday', period: 2 },
			{ day: 'Friday', period: 3 }
		]
	});
	await t.mutation(api.esl.classes.setSchedule, {
		classId: commId,
		year: YEAR,
		meetings: [
			{ day: 'Tuesday', period: 5 },
			{ day: 'Thursday', period: 6 }
		]
	});
	await t.mutation(api.esl.classes.assignTeacher, { id: clilId, teacherId });
	await t.mutation(api.esl.classes.assignTeacher, { id: commId, teacherId: otherId });
	return { t, teacherId, otherId, semesterId, clilId, commId };
}

/** Sign in as the teacher for the read under test. */
function asTeacher() {
	mockAuthUser({ authId: 'esl-teacher' });
}

async function createEvent(
	t: ConvexTestInstance,
	semesterId: Id<'esl_semesters'>,
	event: {
		type:
			| 'task_due'
			| 'homework_due'
			| 'quiz'
			| 'off'
			| 'no_class'
			| 'partial'
			| 'exam'
			| 'start_school';
		label: string;
		target?: 'all' | 'CLIL' | 'Comm' | 'G9';
		date: string;
		endDate?: string;
		note?: string;
		startPeriod?: number;
		endPeriod?: number;
	}
) {
	return t.mutation(api.esl.events.create, { semesterId, ...event });
}

/**
 * Reads the teacher's day rows.
 *
 * The annotated return is load-bearing: `convexTest`'s wrapper erases query
 * return types to `any` (a project-wide follow-up fixes that), so without it
 * every callback over the rows would fail `noImplicitAny`.
 */
async function readDays(
	t: ConvexTestInstance,
	teacherId: Id<'users'>,
	semesterId: Id<'esl_semesters'>,
	range: { fromDate: string; toDate: string }
): Promise<ScheduleDayRow[]> {
	return t.query(api.esl.schedule.teacherDays, { teacherId, semesterId, ...range });
}

describe('esl/schedule.teacherDays', () => {
	afterEach(() => vi.restoreAllMocks());

	it('expands a teacher’s weekly meetings into day rows across the range', async () => {
		const { t, teacherId, semesterId, clilId } = await setupTeacherWorld();
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-01',
			toDate: '2025-09-05'
		});

		expect(days).toHaveLength(3);
		expect(days[0]).toMatchObject({
			date: '2025-09-01',
			weekday: 'Monday',
			classId: clilId,
			period: 1,
			status: 'teaching'
		});
		expect(days[1]).toMatchObject({ date: '2025-09-03', period: 2, status: 'teaching' });
		expect(days[2]).toMatchObject({ date: '2025-09-05', period: 3, status: 'teaching' });
	});

	it('clamps the range to the semester start', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-08-25',
			toDate: '2025-09-01'
		});

		expect(days).toHaveLength(1);
		expect(days[0]).toMatchObject({ date: '2025-09-01' });
	});

	it('collapses a ranged due onto the latest eligible class day', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		// Reminder window Mon 9/8 – Wed 9/10: the teacher meets both days, so
		// the due lands on Wed 9/10 with its window badge and nowhere else.
		await createEvent(t, semesterId, {
			type: 'task_due',
			label: 'Passport check',
			date: '2025-09-08',
			endDate: '2025-09-10'
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-10'
		});

		expect(days).toHaveLength(2);
		expect(days[0].dues).toEqual([]);
		expect(days[1]).toMatchObject({
			date: '2025-09-10',
			dues: [
				{
					label: 'Passport check',
					type: 'task_due',
					windowStart: '2025-09-08',
					windowEnd: '2025-09-10'
				}
			]
		});
		expect(days[1].badges).toContain('due window 2025-09-08–2025-09-10');
	});

	it('lets an off day win the collapse (off-wins)', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		// Window Wed 9/10 – Fri 9/12 with Friday off: the due falls back to
		// the latest eligible day, Wed 9/10.
		await createEvent(t, semesterId, {
			type: 'task_due',
			label: 'Recording HW',
			date: '2025-09-10',
			endDate: '2025-09-12'
		});
		await createEvent(t, semesterId, {
			type: 'off',
			label: 'Typhoon day',
			date: '2025-09-12'
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-10',
			toDate: '2025-09-12'
		});

		const friday = days.find((day) => day.date === '2025-09-12');
		expect(friday).toMatchObject({ status: 'off', cause: 'Typhoon day', dues: [] });
		const wednesday = days.find((day) => day.date === '2025-09-10');
		expect(wednesday?.dues).toHaveLength(1);
		expect(wednesday?.dues[0]).toMatchObject({ label: 'Recording HW' });
	});

	it('marks off, no-class, and exam days with their cause', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		await createEvent(t, semesterId, { type: 'off', label: 'Typhoon day', date: '2025-09-08' });
		await createEvent(t, semesterId, {
			type: 'no_class',
			label: "Sport's Day",
			date: '2025-09-10'
		});
		await createEvent(t, semesterId, { type: 'exam', label: 'Exam 1', date: '2025-09-12' });
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-12'
		});

		expect(days.find((day) => day.date === '2025-09-08')).toMatchObject({
			status: 'off',
			cause: 'Typhoon day'
		});
		expect(days.find((day) => day.date === '2025-09-10')).toMatchObject({
			status: 'no_class',
			cause: "Sport's Day"
		});
		expect(days.find((day) => day.date === '2025-09-12')).toMatchObject({
			status: 'exam',
			cause: 'Exam 1'
		});
	});

	it('badges out-of-window meetings on a partial day', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		// Late start from P2: Monday P1 falls outside the window, Wednesday
		// P2 stays inside it.
		await createEvent(t, semesterId, {
			type: 'partial',
			label: 'Late start',
			date: '2025-09-08',
			startPeriod: 2
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-10'
		});

		const monday = days.find((day) => day.date === '2025-09-08');
		expect(monday).toMatchObject({ status: 'partial', cause: 'Late start' });
		expect(monday?.badges.some((badge) => badge.includes('out-of-window'))).toBe(true);
		expect(days.find((day) => day.date === '2025-09-10')).toMatchObject({
			status: 'teaching'
		});
	});

	it('marks the oral exam on the latest eligible meeting before each exam', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		// A second cohort's Comm class joins the teacher's load (one teacher
		// cannot hold both classes of a cohort). It meets Tue P5 / Thu P6;
		// Exam 1 lands Fri 9/12, so Thu 9/11 carries the oral mark.
		const { classIds: secondIds } = await t.mutation(api.esl.cohorts.create, {
			year: YEAR,
			grade: 8,
			level: 'Basic',
			classNumber: '1'
		});
		// CLIL first, then Comm.
		const secondComm = secondIds[1];
		await t.mutation(api.esl.classes.setSchedule, {
			classId: secondComm,
			year: YEAR,
			meetings: [
				{ day: 'Tuesday', period: 5 },
				{ day: 'Thursday', period: 6 }
			]
		});
		await t.mutation(api.esl.classes.assignTeacher, { id: secondComm, teacherId });
		await createEvent(t, semesterId, { type: 'exam', label: 'Exam 1', date: '2025-09-12' });
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-09',
			toDate: '2025-09-11'
		});

		const thursday = days.find((day) => day.date === '2025-09-11' && day.classId === secondComm);
		expect(thursday).toMatchObject({ status: 'oral_exam' });
		expect(thursday?.badges).toContain('oral ahead of Exam 1');
		const tuesday = days.find((day) => day.date === '2025-09-09' && day.classId === secondComm);
		// Each meeting series gets its own oral: Tue P5 and Thu P6 are
		// different series, and each is the latest of its series before the
		// exam. Per-class count-up: four Tue/Thu meetings from the 8/31
		// start make Thursday class 4 of 4 to Exam 1.
		expect(tuesday).toMatchObject({
			status: 'oral_exam',
			count: { position: 3, total: 4, label: 'Exam 1' }
		});
		expect(thursday).toMatchObject({
			count: { position: 4, total: 4, label: 'Exam 1' }
		});
	});

	it('skips oral-exam marking on CLIL classes', async () => {
		const { t, teacherId, semesterId, clilId } = await setupTeacherWorld();
		await createEvent(t, semesterId, { type: 'exam', label: 'Exam 1', date: '2025-09-12' });
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-12'
		});

		const clilDays = days.filter((day) => day.classId === clilId);
		expect(clilDays.length).toBeGreaterThan(0);
		for (const day of clilDays) {
			expect(day.status).not.toBe('oral_exam');
		}
	});

	it('restarts the count-up at each exam (per-term counts)', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		await createEvent(t, semesterId, { type: 'exam', label: 'Exam 1', date: '2025-09-12' });
		await createEvent(t, semesterId, { type: 'exam', label: 'Exam 2', date: '2025-09-19' });
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-15',
			toDate: '2025-09-19'
		});

		// Mon 9/15 is the first class after Exam 1, counting toward Exam 2.
		const monday = days.find((day) => day.date === '2025-09-15');
		expect(monday).toMatchObject({
			status: 'teaching',
			count: { position: 1, label: 'Exam 2' }
		});
	});

	it('carries no count past the final exam', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		await createEvent(t, semesterId, { type: 'exam', label: 'Final exam', date: '2025-09-12' });
		asTeacher();

		// The semester ends on the final exam: the exam day is the last row,
		// and the Monday after has no rows at all.
		const examWeek = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-15'
		});
		expect(examWeek.map((day) => day.date)).not.toContain('2025-09-15');
		const examDay = examWeek.find((day) => day.date === '2025-09-12');
		expect(examDay).toMatchObject({ status: 'exam', cause: 'Final exam' });
	});

	it('anchors G9-in-S2 counts on the graduation ceremony', async () => {
		const t = convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
		const teacherId = await seedEslStaff(t, {
			authId: 'esl-teacher',
			eslRole: 'teacher',
			signIn: false
		});
		const semesterId = await t.mutation(api.esl.semesters.create, {
			year: '2025-2026',
			term: 'S2',
			startDate: '2026-02-09'
		});
		// A G9 cohort: Mon P1 + Fri P2 — the Friday meeting puts a class day
		// under the ceremony itself.
		const { classIds } = await t.mutation(api.esl.cohorts.create, {
			year: '2025-2026',
			grade: 9,
			level: 'Basic',
			classNumber: '1'
		});
		const [g9Id] = classIds;
		await t.mutation(api.esl.classes.setSchedule, {
			classId: g9Id,
			year: '2025-2026',
			meetings: [
				{ day: 'Monday', period: 1 },
				{ day: 'Friday', period: 2 }
			]
		});
		await t.mutation(api.esl.classes.assignTeacher, { id: g9Id, teacherId });
		// The final exam lands after the ceremony, but G9 counts toward the
		// ceremony — G9 has no ESL classes after it. The query clamps the
		// semester window at the final exam, so the range must cover it.
		await createEvent(t, semesterId, {
			type: 'no_class',
			label: 'Graduation ceremony',
			target: 'G9',
			date: '2026-06-05'
		});
		await createEvent(t, semesterId, {
			type: 'exam',
			label: 'Final exam',
			date: '2026-06-19'
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2026-06-01',
			toDate: '2026-06-19'
		});

		const g9Days = days.filter((day) => day.classId === g9Id);
		expect(g9Days.length).toBeGreaterThan(0);
		for (const day of g9Days) {
			expect(day.count?.label).toBe('Graduation ceremony');
		}
		// The ceremony day itself keeps its no-class status while still
		// carrying the final tick of the count-up.
		expect(g9Days.find((day) => day.date === '2026-06-05')).toMatchObject({
			status: 'no_class',
			cause: 'Graduation ceremony'
		});
		// Graduated: the G9 schedule stops at the ceremony even though the
		// window still runs to the final exam for everyone else.
		expect(g9Days.some((day) => day.date > '2026-06-05')).toBe(false);
	});

	it('filters events by target (G10 sees all-target events only)', async () => {
		const { t, teacherId, semesterId, clilId } = await setupTeacherWorld();
		// A CLIL-targeted off day reaches the teacher's CLIL class; a Comm
		// one does not.
		await createEvent(t, semesterId, {
			type: 'off',
			label: 'CLIL retreat',
			target: 'CLIL',
			date: '2025-09-08'
		});
		await createEvent(t, semesterId, {
			type: 'task_due',
			label: 'Comm survey',
			target: 'Comm',
			date: '2025-09-03',
			endDate: '2025-09-05'
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-10'
		});

		expect(days.find((day) => day.date === '2025-09-08')).toMatchObject({
			classId: clilId,
			status: 'off',
			cause: 'CLIL retreat'
		});
		for (const day of days) {
			expect(day.dues.map((due) => due.label)).not.toContain('Comm survey');
		}
	});
});
