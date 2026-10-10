import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest, modules, mockAuthUser, seedEslStaff, ESL_ALICE, ESL_BOB } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';

async function asEslAdmin(authId = 'esl-admin') {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId, eslRole: 'admin' });
	return t;
}

/**
 * Creates a G7 cohort and returns `{ cohortId, classIds }` (CLIL first, then Comm).
 *
 * `classNumber` defaults to `1` so the common case stays a bare call; a test that
 * needs a second, distinct cohort in the same year passes `'2'`.
 */
async function createG7(t: Awaited<ReturnType<typeof convexTest>>, classNumber = '1') {
	return t.mutation(api.esl.cohorts.create, {
		year: '2025-2026',
		grade: 7,
		level: 'Basic',
		classNumber
	});
}

describe('esl classes', () => {
	afterEach(() => vi.restoreAllMocks());

	describe('listByTeacher', () => {
		it('lists assigned classes with cohort and teacher names', async () => {
			const t = await asEslAdmin();
			const teacherId = await seedEslStaff(t, {
				authId: 'class-teacher',
				name: 'Ms Chan',
				eslRole: 'teacher',
				signIn: false
			});
			// Two *different* cohorts, so one teacher can legally hold both. The two
			// classes of a single cohort cannot share a teacher (ADR-0027), and
			// `assignTeacher` now enforces it — a rule that made this fixture
			// invalid rather than merely unrealistic.
			const first = await createG7(t, '1');
			const second = await createG7(t, '2');
			await t.mutation(api.esl.classes.assignTeacher, { id: first.classIds[0], teacherId });
			await t.mutation(api.esl.classes.assignTeacher, { id: second.classIds[0], teacherId });

			const classes = await t.query(api.esl.classes.listByTeacher, { teacherId });

			expect(classes).toHaveLength(2);
			expect(classes[0].cohortLabel).toBe('2025-2026 G7 Basic 1');
			expect(classes[0].cohortGrade).toBe(7);
			expect(classes[0].teacherName).toBe('Ms Chan');
		});

		it('returns only the classes of that teacher', async () => {
			const t = await asEslAdmin();
			const teacherA = await seedEslStaff(t, { authId: 'teacher-a', signIn: false });
			const teacherB = await seedEslStaff(t, { authId: 'teacher-b', signIn: false });
			const { classIds } = await createG7(t);
			await t.mutation(api.esl.classes.assignTeacher, { id: classIds[0], teacherId: teacherA });
			await t.mutation(api.esl.classes.assignTeacher, { id: classIds[1], teacherId: teacherB });

			const classesA = await t.query(api.esl.classes.listByTeacher, { teacherId: teacherA });
			const classesB = await t.query(api.esl.classes.listByTeacher, { teacherId: teacherB });

			expect(classesA).toHaveLength(1);
			expect(classesB).toHaveLength(1);
			expect(classesA[0]._id).toBe(classIds[0]);
		});

		it('rejects a read from an unauthenticated caller', async () => {
			const t = await asEslAdmin();
			const teacherId = await seedEslStaff(t, { authId: 'esl-teacher', signIn: false });
			mockAuthUser(null);

			await expect(t.query(api.esl.classes.listByTeacher, { teacherId })).rejects.toThrow(
				'Unauthorized'
			);
		});
	});

	describe('assignTeacher', () => {
		it('unassigns a teacher when teacherId is omitted', async () => {
			const t = await asEslAdmin();
			const teacherId = await seedEslStaff(t, { authId: 'class-teacher', signIn: false });
			const { classIds } = await createG7(t);
			await t.mutation(api.esl.classes.assignTeacher, { id: classIds[0], teacherId });

			await t.mutation(api.esl.classes.assignTeacher, { id: classIds[0] });

			expect(await t.query(api.esl.classes.listByTeacher, { teacherId })).toHaveLength(0);
		});

		it('rejects an unknown teacher', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);
			const ghostId = await t.run((ctx) =>
				ctx.db.insert('users', { authId: 'ghost', role: 'teacher', status: 'active' })
			);
			await t.run((ctx) => ctx.db.delete(ghostId));

			await expect(
				t.mutation(api.esl.classes.assignTeacher, { id: classIds[0], teacherId: ghostId })
			).rejects.toThrow('Teacher not found');
		});
	});

	describe('getRoster', () => {
		it('returns the same students for the CLIL and Comm classes of a G7 cohort', async () => {
			const t = await asEslAdmin();
			const { cohortId, classIds } = await createG7(t);
			await t.mutation(api.esl.students.bulkImport, {
				cohortId,
				students: [ESL_ALICE, ESL_BOB]
			});

			const clil = await t.query(api.esl.classes.getRoster, { classId: classIds[0] });
			const comm = await t.query(api.esl.classes.getRoster, { classId: classIds[1] });

			const clilIds = clil.students.map((s: { schoolStudentId: string }) => s.schoolStudentId);
			const commIds = comm.students.map((s: { schoolStudentId: string }) => s.schoolStudentId);
			expect(clilIds).toEqual(['7001001', '8123456']);
			expect(commIds).toEqual(clilIds);
			expect(clil.sharedRoster).toBe(true);
			expect(comm.cohort._id).toBe(cohortId);
		});

		it('marks a G9 class as not sharing a roster', async () => {
			const t = await asEslAdmin();
			const { cohortId, classIds } = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 9,
				level: 'Intermediate',
				classNumber: '1'
			});
			await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE, chineseClass: 'J301' });

			const roster = await t.query(api.esl.classes.getRoster, { classId: classIds[0] });

			expect(roster.sharedRoster).toBe(false);
			expect(roster.students).toHaveLength(1);
		});

		it('hides disabled students unless asked for them', async () => {
			const t = await asEslAdmin();
			const { cohortId, classIds } = await createG7(t);
			const bobId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_BOB });
			await t.mutation(api.esl.students.updateStatus, {
				id: bobId,
				status: 'disabled',
				statusReason: 'Transferred to G8'
			});

			const active = await t.query(api.esl.classes.getRoster, { classId: classIds[0] });
			const all = await t.query(api.esl.classes.getRoster, {
				classId: classIds[0],
				includeDisabled: true
			});

			expect(active.students).toHaveLength(0);
			expect(all.students).toHaveLength(1);
			expect(all.students[0].status).toBe('disabled');
		});

		it('sorts the roster alphabetically by English name', async () => {
			const t = await asEslAdmin();
			const { cohortId, classIds } = await createG7(t);
			await t.mutation(api.esl.students.bulkImport, {
				cohortId,
				students: [ESL_BOB, ESL_ALICE]
			});

			const roster = await t.query(api.esl.classes.getRoster, { classId: classIds[0] });

			expect(roster.students.map((s) => s.englishName)).toEqual(['Alice Chan', 'Bob Lee']);
		});

		it('rejects a read from an unauthenticated caller', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);
			mockAuthUser(null);

			await expect(t.query(api.esl.classes.getRoster, { classId: classIds[0] })).rejects.toThrow(
				'Unauthorized'
			);
		});
	});
});
