import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, mockAuthUser, seedEslStaff } from '../test.setup';
import type { ConvexTestInstance } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';
import type { EslEventTarget, EslEventType, EslReminderKind } from '../shared/esl';

const YEAR = '2025-2026';

/**
 * The setup every slice shares: an S1 semester starting Sunday 2025-08-31, a
 * G7 cohort whose CLIL class (Mon P1 / Wed P2 / Fri P3) belongs to the teacher,
 * and whose Comm class belongs to someone else.
 */
async function setupTeacherWorld() {
	const t = await convexTest(schema, modules);
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
		type: EslEventType;
		reminderKind?: EslReminderKind;
		isBanner?: boolean;
		title: string;
		target?: EslEventTarget;
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
 * The return type is inferred from `t.query(...)` -- the `convexTest`
 * wrapper preserves query return types (instead of erasing them to `any`),
 * so no local annotation is needed.
 */
async function readDays(
	t: ConvexTestInstance,
	teacherId: Id<'users'>,
	semesterId: Id<'esl_semesters'>,
	range: { fromDate: string; toDate: string }
) {
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
			type: 'reminder',
			reminderKind: 'task',
			isBanner: false,
			title: 'Passport check',
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
					title: 'Passport check',
					type: 'reminder',
					reminderKind: 'task',
					windowStart: '2025-09-08',
					windowEnd: '2025-09-10'
				}
			]
		});
		expect(days[1].badges).toContain('due window 2025-09-08–2025-09-10');
	});

	it('marks a banner due as one and drops its day-chip badge (#224)', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		// The default banner flag: the reminder rides the week row instead of
		// a day chip, so the collapse day carries no `due window` badge.
		await createEvent(t, semesterId, {
			type: 'reminder',
			reminderKind: 'task',
			title: 'Passport check',
			date: '2025-09-08',
			endDate: '2025-09-10'
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-10'
		});

		expect(days[1].dues).toEqual([
			{
				title: 'Passport check',
				type: 'reminder',
				reminderKind: 'task',
				isBanner: true,
				windowStart: '2025-09-08',
				windowEnd: '2025-09-10'
			}
		]);
		expect(days[1].badges).not.toContain('due window 2025-09-08–2025-09-10');
		expect(days[1].badges).toEqual([]);
	});

	it('lets an off day win the collapse (off-wins)', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		// Window Wed 9/10 – Fri 9/12 with Friday off: the due falls back to
		// the latest eligible day, Wed 9/10.
		await createEvent(t, semesterId, {
			type: 'reminder',
			reminderKind: 'task',
			title: 'Recording due',
			date: '2025-09-10',
			endDate: '2025-09-12'
		});
		await createEvent(t, semesterId, {
			type: 'no_school',
			title: 'Off',
			note: 'Typhoon day',
			date: '2025-09-12'
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-10',
			toDate: '2025-09-12'
		});

		const friday = days.find((day) => day.date === '2025-09-12');
		expect(friday).toMatchObject({ status: 'off', cause: 'Off', dues: [] });
		const wednesday = days.find((day) => day.date === '2025-09-10');
		expect(wednesday?.dues).toHaveLength(1);
		expect(wednesday?.dues[0]).toMatchObject({ title: 'Recording due' });
	});

	it('marks off, no-class, and exam days with their cause', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		await createEvent(t, semesterId, {
			type: 'no_school',
			title: 'Off',
			note: 'Typhoon day',
			date: '2025-09-08'
		});
		await createEvent(t, semesterId, {
			type: 'no_class',
			title: 'No class',
			note: "Sport's Day",
			date: '2025-09-10'
		});
		await createEvent(t, semesterId, { type: 'exam', title: 'Exam 1', date: '2025-09-12' });
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-12'
		});

		expect(days.find((day) => day.date === '2025-09-08')).toMatchObject({
			status: 'off',
			cause: 'Off'
		});
		expect(days.find((day) => day.date === '2025-09-10')).toMatchObject({
			status: 'no_class',
			cause: 'No class'
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
			title: 'No class',
			note: 'Late start',
			date: '2025-09-08',
			startPeriod: 2
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-10'
		});

		const monday = days.find((day) => day.date === '2025-09-08');
		expect(monday).toMatchObject({ status: 'partial', cause: 'No class' });
		expect(monday?.badges.some((badge) => badge.includes('out-of-window'))).toBe(true);
		// The list renders note-only for out-of-window meetings (#212).
		expect(monday?.outOfWindow).toBe(true);
		expect(days.find((day) => day.date === '2025-09-10')).toMatchObject({
			status: 'teaching'
		});
		expect(days.find((day) => day.date === '2025-09-10')?.outOfWindow).not.toBe(true);
	});

	it('renders pre-P3 meetings on the start day as No class', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		// Start at P3 on Monday 9/1: the P1 meeting falls outside the
		// window and renders No class; later days run as usual.
		await createEvent(t, semesterId, {
			type: 'start_school',
			title: 'Start at P3',
			date: '2025-09-01'
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-01',
			toDate: '2025-09-05'
		});

		const monday = days.find((day) => day.date === '2025-09-01');
		expect(monday).toMatchObject({
			status: 'no_class',
			cause: 'Start at P3'
		});
		expect(monday?.badges.some((badge) => badge.includes('out-of-window'))).toBe(true);
		expect(days.find((day) => day.date === '2025-09-03')).toMatchObject({
			status: 'teaching',
			cause: null
		});
		expect(days.find((day) => day.date === '2025-09-05')).toMatchObject({
			status: 'teaching',
			cause: null
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
		await createEvent(t, semesterId, { type: 'exam', title: 'Exam 1', date: '2025-09-12' });
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
		await createEvent(t, semesterId, { type: 'exam', title: 'Exam 1', date: '2025-09-12' });
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
		// Thu 9/11 fans out to Thu + Fri; Exam 2 on Fri 9/19 takes Fri + Mon
		// 9/22, outside the read range.
		await createEvent(t, semesterId, { type: 'exam', title: 'Exam 1', date: '2025-09-11' });
		await createEvent(t, semesterId, { type: 'exam', title: 'Exam 2', date: '2025-09-19' });
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
		// Wed 9/10 fans out to Wed + Thu + Fri: the Friday exam day is the
		// last row, and the Monday after has no rows at all.
		await createEvent(t, semesterId, { type: 'exam', title: 'Final Exam', date: '2025-09-10' });
		asTeacher();

		// The semester ends on the final exam: the exam day is the last row,
		// and the Monday after has no rows at all.
		const examWeek = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-15'
		});
		expect(examWeek.map((day) => day.date)).not.toContain('2025-09-15');
		const examDay = examWeek.find((day) => day.date === '2025-09-12');
		expect(examDay).toMatchObject({ status: 'exam', cause: 'Final Exam' });
	});

	it('anchors G9-in-S2 counts on the graduation ceremony', async () => {
		const t = await convexTest(schema, modules);
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
			title: 'No class',
			note: 'Graduation ceremony',
			target: 'all',
			date: '2026-06-05'
		});
		await createEvent(t, semesterId, {
			type: 'exam',
			title: 'Final Exam',
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
			cause: 'No class'
		});
		// Graduated: the G9 schedule stops at the ceremony even though the
		// window still runs to the final exam for everyone else.
		expect(g9Days.some((day) => day.date > '2026-06-05')).toBe(false);
	});

	it('carries every reminder kind through the join, collapsed onto its own lesson', async () => {
		const { t, teacherId, semesterId, clilId } = await setupTeacherWorld();
		// A second cohort's Comm class joins the teacher's load (one teacher
		// cannot hold both classes of a cohort). It meets Tue P5 / Thu P6.
		const { classIds: secondIds } = await t.mutation(api.esl.cohorts.create, {
			year: YEAR,
			grade: 8,
			level: 'Basic',
			classNumber: '1'
		});
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
		// One row per reminder kind, each landing on the latest class day of
		// the lesson its locked target names.
		const kinds: {
			reminderKind: EslReminderKind;
			title: string;
			target: EslEventTarget;
			date: string;
			endDate?: string;
		}[] = [
			{
				reminderKind: 'quiz',
				title: 'Unit 1 Quiz Due',
				target: 'CLIL',
				date: '2025-09-08',
				endDate: '2025-09-10'
			},
			{
				reminderKind: 'workbook_check',
				title: 'Workbook check',
				target: 'CLIL',
				date: '2025-09-05'
			},
			{
				reminderKind: 'passport',
				title: 'Passport due',
				target: 'Comm',
				date: '2025-09-09',
				endDate: '2025-09-11'
			},
			{
				reminderKind: 'recording',
				title: 'Recording due',
				target: 'Comm',
				date: '2025-09-15',
				endDate: '2025-09-18'
			},
			{
				reminderKind: 'passport_check',
				title: 'Passport check',
				target: 'Comm',
				date: '2025-09-09'
			},
			{
				reminderKind: 'task',
				title: 'Comm survey',
				target: 'Comm',
				date: '2025-09-08',
				endDate: '2025-09-09'
			}
		];
		for (const kind of kinds) {
			await createEvent(t, semesterId, { type: 'reminder', ...kind });
		}
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-05',
			toDate: '2025-09-18'
		});

		const dueTitles = (date: string, classId: string) =>
			days
				.filter((day) => day.date === date && day.classId === classId)
				.flatMap((day) => day.dues.map((due) => due.title))
				.sort();
		expect(dueTitles('2025-09-05', clilId)).toEqual(['Workbook check']);
		expect(dueTitles('2025-09-10', clilId)).toEqual(['Unit 1 Quiz Due']);
		expect(dueTitles('2025-09-09', secondComm)).toEqual(['Comm survey', 'Passport check']);
		expect(dueTitles('2025-09-11', secondComm)).toEqual(['Passport due']);
		expect(dueTitles('2025-09-18', secondComm)).toEqual(['Recording due']);
		for (const day of days) {
			const titles = day.dues.map((due) => due.title);
			if (day.classId === clilId) {
				expect(titles).not.toContain('Comm survey');
			} else {
				expect(titles).not.toContain('Unit 1 Quiz Due');
			}
		}
	});

	it('renders g9 mocks as consecutive day chips, never a range (#224)', async () => {
		const { t, teacherId, semesterId } = await setupTeacherWorld();
		// A G9 cohort is taught by one class of type `G9`; two of them give the
		// teacher mock days back to back plus a class day after them.
		const mockClasses: string[] = [];
		for (const classNumber of ['1', '2']) {
			const { classIds } = await t.mutation(api.esl.cohorts.create, {
				year: YEAR,
				grade: 9,
				level: 'Basic',
				classNumber
			});
			const [g9Id] = classIds;
			await t.mutation(api.esl.classes.setSchedule, {
				classId: g9Id,
				year: YEAR,
				meetings:
					classNumber === '1'
						? [
								{ day: 'Monday', period: 2 },
								{ day: 'Tuesday', period: 1 }
							]
						: [
								{ day: 'Monday', period: 3 },
								{ day: 'Wednesday', period: 4 }
							]
			});
			await t.mutation(api.esl.classes.assignTeacher, { id: g9Id, teacherId });
			mockClasses.push(g9Id);
		}
		const [mondayG9, wednesdayG9] = mockClasses;
		// The seed writes two single-date g9_mock rows per mock start.
		await createEvent(t, semesterId, {
			type: 'g9_mock',
			title: 'G9 Mock Exam',
			target: 'G9',
			date: '2025-09-08'
		});
		// A task-kind reminder may target G9: its window spans the mocks, so
		// the collapse falls through to the next class day.
		await createEvent(t, semesterId, {
			type: 'reminder',
			reminderKind: 'task',
			title: 'Mock-week survey',
			target: 'G9',
			date: '2025-09-08',
			endDate: '2025-09-10'
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-10'
		});

		// Two consecutive day chips on the class that meets both mock days.
		const mocks = days.filter((day) => day.classId === mondayG9 && day.date < '2025-09-10');
		expect(mocks.map((day) => day.date)).toEqual(['2025-09-08', '2025-09-09']);
		for (const mock of mocks) {
			expect(mock).toMatchObject({ status: 'g9_mock', cause: 'G9 Mock Exam', dues: [] });
			// A mock day is exam-like, so it carries no per-term count.
			expect(mock.count).toBeNull();
		}
		// The window's only eligible class day is Wednesday, so the due lands
		// there rather than on a mock day.
		const wednesday = days.find((day) => day.date === '2025-09-10' && day.classId === wednesdayG9);
		expect(wednesday?.dues.map((due) => due.title)).toEqual(['Mock-week survey']);
		expect(wednesday).toMatchObject({ status: 'teaching' });
		// Neither mock day collects the due, in either class.
		for (const day of days.filter((row) => row.date < '2025-09-10')) {
			expect(day.dues).toEqual([]);
		}
	});

	it('greys P1 and P2 on the start day while P3 and later teach as usual (#224)', async () => {
		const { t, teacherId, semesterId, clilId } = await setupTeacherWorld();
		// A day carries one period per class, so three classes put P1, P2 and
		// P3 on the same Tuesday: the first two grey, the third teaches.
		await t.mutation(api.esl.classes.setSchedule, {
			classId: clilId,
			year: YEAR,
			meetings: [
				{ day: 'Tuesday', period: 1 },
				{ day: 'Wednesday', period: 2 },
				{ day: 'Friday', period: 3 }
			]
		});
		const { classIds: secondIds } = await t.mutation(api.esl.cohorts.create, {
			year: YEAR,
			grade: 8,
			level: 'Basic',
			classNumber: '1'
		});
		await t.mutation(api.esl.classes.setSchedule, {
			classId: secondIds[0],
			year: YEAR,
			meetings: [
				{ day: 'Tuesday', period: 2 },
				{ day: 'Wednesday', period: 3 },
				{ day: 'Friday', period: 4 }
			]
		});
		await t.mutation(api.esl.classes.assignTeacher, { id: secondIds[0], teacherId });
		const { classIds: g9Ids } = await t.mutation(api.esl.cohorts.create, {
			year: YEAR,
			grade: 9,
			level: 'Basic',
			classNumber: '1'
		});
		await t.mutation(api.esl.classes.setSchedule, {
			classId: g9Ids[0],
			year: YEAR,
			meetings: [
				{ day: 'Tuesday', period: 3 },
				{ day: 'Thursday', period: 4 }
			]
		});
		await t.mutation(api.esl.classes.assignTeacher, { id: g9Ids[0], teacherId });
		await createEvent(t, semesterId, {
			type: 'start_school',
			title: 'Start at P3',
			date: '2025-09-02'
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-02',
			toDate: '2025-09-02'
		});

		expect(days).toHaveLength(3);
		const byPeriod = new Map(days.map((day) => [day.period, day]));
		expect(byPeriod.get(1)).toMatchObject({ status: 'no_class', cause: 'Start at P3' });
		expect(byPeriod.get(2)).toMatchObject({ status: 'no_class', cause: 'Start at P3' });
		expect(byPeriod.get(3)).toMatchObject({ status: 'teaching', cause: null });
	});

	it('filters dues by target (a CLIL quiz-kind reminder reaches CLIL only, a Comm task-kind Comm only)', async () => {
		const { t, teacherId, semesterId, clilId } = await setupTeacherWorld();
		// A second cohort's Comm class joins the teacher's load (one teacher
		// cannot hold both classes of a cohort). It meets Tue P5 / Thu P6.
		const { classIds: secondIds } = await t.mutation(api.esl.cohorts.create, {
			year: YEAR,
			grade: 8,
			level: 'Basic',
			classNumber: '1'
		});
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
		// Quiz-kind reminders are CLIL-locked, task-kind takes a Comm pick:
		// each collapses onto its own lesson's latest eligible day.
		await createEvent(t, semesterId, {
			type: 'reminder',
			reminderKind: 'quiz',
			title: 'Unit 1 Quiz Due',
			target: 'CLIL',
			date: '2025-09-08',
			endDate: '2025-09-10'
		});
		await createEvent(t, semesterId, {
			type: 'reminder',
			reminderKind: 'task',
			title: 'Comm survey',
			target: 'Comm',
			date: '2025-09-08',
			endDate: '2025-09-11'
		});
		asTeacher();

		const days = await readDays(t, teacherId, semesterId, {
			fromDate: '2025-09-08',
			toDate: '2025-09-11'
		});

		const clilWednesday = days.find((day) => day.date === '2025-09-10' && day.classId === clilId);
		expect(clilWednesday?.dues.map((due) => due.title)).toEqual(['Unit 1 Quiz Due']);
		const commThursday = days.find(
			(day) => day.date === '2025-09-11' && day.classId === secondComm
		);
		expect(commThursday?.dues.map((due) => due.title)).toEqual(['Comm survey']);
		for (const day of days) {
			if (day.classId === clilId) {
				expect(day.dues.map((due) => due.title)).not.toContain('Comm survey');
			} else {
				expect(day.dues.map((due) => due.title)).not.toContain('Unit 1 Quiz Due');
			}
		}
	});
});
