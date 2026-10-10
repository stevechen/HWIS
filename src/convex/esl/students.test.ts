import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest, modules, seedEslStaff, ESL_ALICE, ESL_BOB } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';

async function asEslAdmin(authId = 'esl-admin') {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId, eslRole: 'admin' });
	return t;
}

async function createG7(t: Awaited<ReturnType<typeof convexTest>>) {
	return t.mutation(api.esl.cohorts.create, {
		year: '2025-2026',
		grade: 7,
		level: 'Basic',
		classNumber: '1'
	});
}

describe('esl students', () => {
	afterEach(() => vi.restoreAllMocks());

	describe('create', () => {
		it('enrols a student as active', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const studentId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });

			const student = await t.query(api.esl.students.getById, { id: studentId });
			expect(student).toMatchObject({
				cohortId,
				englishName: 'Alice Chan',
				chineseName: '陳小美',
				schoolStudentId: '7001001',
				// Stored as the bare class number; the `J1` marker is the
				// grade's and is rebuilt by chineseClassCode on read (ADR-0025).
				chineseClass: '01',
				status: 'active'
			});
			expect(student?.disabledAt).toBeUndefined();
		});

		it('accepts a 6-digit school ID', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const studentId = await t.mutation(api.esl.students.create, {
				cohortId,
				englishName: 'Carol Ho',
				chineseName: '何家明',
				schoolStudentId: '100234',
				chineseClass: 'J101'
			});

			expect(studentId).toBeDefined();
		});

		it('rejects a 5-digit school ID', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			await expect(
				t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE, schoolStudentId: '12345' })
			).rejects.toThrow('School student ID must be a 6- or 7-digit number');
		});

		it('rejects a non-numeric school ID', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			await expect(
				t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE, schoolStudentId: 'S123456' })
			).rejects.toThrow('School student ID must be a 6- or 7-digit number');
		});

		it('rejects a duplicate enrolment in the same cohort', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });

			await expect(t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE })).rejects.toThrow(
				'already enrolled in this class'
			);
		});

		it('allows the same school ID in a different cohort', async () => {
			const t = await asEslAdmin();
			const first = await createG7(t);
			const second = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 7,
				level: 'Basic',
				classNumber: '2'
			});
			await t.mutation(api.esl.students.create, { cohortId: first.cohortId, ...ESL_ALICE });

			const studentId = await t.mutation(api.esl.students.create, {
				cohortId: second.cohortId,
				...ESL_ALICE
			});

			expect(studentId).toBeDefined();
		});

		it('rejects enrolment into an archived cohort', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await t.mutation(api.esl.cohorts.update, { id: cohortId, status: 'archived' });

			await expect(t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE })).rejects.toThrow(
				'Archived cohorts cannot accept new students'
			);
		});

		it('rejects a write from an ESL teacher', async () => {
			const admin = await asEslAdmin();
			const { cohortId } = await createG7(admin);
			const t = await convexTest(schema, modules);
			await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });

			await expect(t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE })).rejects.toThrow(
				'Forbidden: ESL admin access required'
			);
		});
	});

	describe('bulkImport', () => {
		it('imports a valid batch', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const result = await t.mutation(api.esl.students.bulkImport, {
				cohortId,
				students: [ESL_ALICE, ESL_BOB]
			});

			expect(result.imported).toBe(2);
			expect(result.rejected).toEqual([]);
			expect(await t.query(api.esl.students.listByCohort, { cohortId })).toHaveLength(2);
		});

		it('rejects invalid rows but still imports the good ones', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const result = await t.mutation(api.esl.students.bulkImport, {
				cohortId,
				students: [
					ESL_ALICE,
					{ englishName: 'Bad Id', chineseName: '錯', schoolStudentId: '12', chineseClass: 'J101' },
					{ englishName: '', chineseName: '無名', schoolStudentId: '7001003', chineseClass: 'J101' }
				]
			});

			expect(result.imported).toBe(1);
			expect(result.rejected).toHaveLength(2);
			expect(result.rejected[0].index).toBe(1);
			expect(result.rejected[1].reason).toBe('English name is required');
		});

		it('rejects a row that duplicates an existing enrolment', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });

			const result = await t.mutation(api.esl.students.bulkImport, {
				cohortId,
				students: [ESL_ALICE, ESL_BOB]
			});

			expect(result.imported).toBe(1);
			expect(result.rejected).toEqual([
				{ index: 0, schoolStudentId: '7001001', reason: 'Already enrolled in this cohort' }
			]);
		});

		it('rejects a duplicate within the batch itself', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const result = await t.mutation(api.esl.students.bulkImport, {
				cohortId,
				students: [ESL_ALICE, ESL_ALICE]
			});

			expect(result.imported).toBe(1);
			expect(result.rejected[0].index).toBe(1);
		});

		it('rejects an empty batch', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			await expect(
				t.mutation(api.esl.students.bulkImport, { cohortId, students: [] })
			).rejects.toThrow('No students supplied');
		});

		it('writes nothing when the cohort is archived', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await t.mutation(api.esl.cohorts.update, { id: cohortId, status: 'archived' });

			await expect(
				t.mutation(api.esl.students.bulkImport, { cohortId, students: [ESL_ALICE] })
			).rejects.toThrow('Archived cohorts cannot accept new students');
			expect(await t.query(api.esl.students.listByCohort, { cohortId })).toHaveLength(0);
		});
	});

	describe('updateStatus (transfer lifecycle)', () => {
		it('disables an active student and records the reason', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			const studentId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });

			await t.mutation(api.esl.students.updateStatus, {
				id: studentId,
				status: 'disabled',
				statusReason: 'Transferred to G8 cohort'
			});

			const student = await t.query(api.esl.students.getById, { id: studentId });
			expect(student?.status).toBe('disabled');
			expect(student?.statusReason).toBe('Transferred to G8 cohort');
			expect(student?.disabledAt).toBeGreaterThan(0);
		});

		it('removes the student from the active roster of both G7 classes', async () => {
			const t = await asEslAdmin();
			const { cohortId, classIds } = await createG7(t);
			const studentId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });
			await t.mutation(api.esl.students.updateStatus, {
				id: studentId,
				status: 'disabled',
				statusReason: 'Withdrew'
			});

			const clil = await t.query(api.esl.classes.getRoster, { classId: classIds[0] });
			const comm = await t.query(api.esl.classes.getRoster, { classId: classIds[1] });

			expect(clil.students).toHaveLength(0);
			expect(comm.students).toHaveLength(0);
		});

		it('re-enables a transferred student, clearing the transfer record', async () => {
			const t = await asEslAdmin();
			const { cohortId, classIds } = await createG7(t);
			const studentId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });
			await t.mutation(api.esl.students.updateStatus, {
				id: studentId,
				status: 'disabled',
				statusReason: 'Medical leave'
			});

			await t.mutation(api.esl.students.updateStatus, { id: studentId, status: 'active' });

			const student = await t.query(api.esl.students.getById, { id: studentId });
			expect(student?.status).toBe('active');
			expect(student?.statusReason).toBeUndefined();
			expect(student?.disabledAt).toBeUndefined();
			const clil = await t.query(api.esl.classes.getRoster, { classId: classIds[0] });
			expect(clil.students).toHaveLength(1);
		});

		it('keeps the same cohort row across the whole lifecycle', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			const studentId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });

			await t.mutation(api.esl.students.updateStatus, {
				id: studentId,
				status: 'disabled',
				statusReason: 'Transferred out'
			});
			await t.mutation(api.esl.students.updateStatus, { id: studentId, status: 'active' });

			const student = await t.query(api.esl.students.getById, { id: studentId });
			expect(student?.cohortId).toBe(cohortId);
		});

		it('requires a reason to disable', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			const studentId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });

			await expect(
				t.mutation(api.esl.students.updateStatus, { id: studentId, status: 'disabled' })
			).rejects.toThrow('A status reason is required when disabling a student');
		});

		it('rejects a whitespace-only reason', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			const studentId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });

			await expect(
				t.mutation(api.esl.students.updateStatus, {
					id: studentId,
					status: 'disabled',
					statusReason: '   '
				})
			).rejects.toThrow('A status reason is required when disabling a student');
		});

		it('rejects disabling an already-disabled student', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			const studentId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });
			await t.mutation(api.esl.students.updateStatus, {
				id: studentId,
				status: 'disabled',
				statusReason: 'Transferred out'
			});

			await expect(
				t.mutation(api.esl.students.updateStatus, {
					id: studentId,
					status: 'disabled',
					statusReason: 'Again'
				})
			).rejects.toThrow('Student is already disabled');
		});

		it('rejects re-activating an already-active student', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			const studentId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });

			await expect(
				t.mutation(api.esl.students.updateStatus, { id: studentId, status: 'active' })
			).rejects.toThrow('Student is already active');
		});

		it('rejects a write from an ESL teacher', async () => {
			const admin = await asEslAdmin();
			const { cohortId } = await createG7(admin);
			const studentId = await admin.mutation(api.esl.students.create, {
				cohortId,
				...ESL_ALICE
			});
			const t = await convexTest(schema, modules);
			await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });

			await expect(
				t.mutation(api.esl.students.updateStatus, {
					id: studentId,
					status: 'disabled',
					statusReason: 'Nope'
				})
			).rejects.toThrow('Forbidden: ESL admin access required');
		});
	});

	describe('queries', () => {
		it('lists a cohort roster, hiding disabled students by default', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			const aliceId = await t.mutation(api.esl.students.create, { cohortId, ...ESL_ALICE });
			await t.mutation(api.esl.students.create, { cohortId, ...ESL_BOB });
			await t.mutation(api.esl.students.updateStatus, {
				id: aliceId,
				status: 'disabled',
				statusReason: 'Transferred out'
			});

			expect(await t.query(api.esl.students.listByCohort, { cohortId })).toHaveLength(1);
			expect(
				await t.query(api.esl.students.listByCohort, { cohortId, includeDisabled: true })
			).toHaveLength(2);
		});

		it('finds a student by school ID across cohorts', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await t.mutation(api.esl.students.create, { cohortId, ...ESL_BOB });

			const found = await t.query(api.esl.students.getBySchoolStudentId, {
				schoolStudentId: '8123456'
			});

			expect(found?.englishName).toBe('Bob Lee');
		});

		it('returns null for an unknown school ID', async () => {
			const t = await asEslAdmin();

			const found = await t.query(api.esl.students.getBySchoolStudentId, {
				schoolStudentId: '9999999'
			});

			expect(found).toBeNull();
		});
	});
});
