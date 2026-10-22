import { describe, it, expect, afterEach, vi } from 'vite-plus/test';
import { convexTest, modules, seedEslStaff, type ConvexTestInstance } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';

async function asEslAdmin(authId = 'esl-admin') {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId, eslRole: 'admin' });
	return t;
}

async function createCohort(
	t: ConvexTestInstance,
	options: { grade: number; level?: string; classNumber?: string } = { grade: 7, level: 'Advanced' }
) {
	return t.mutation(api.esl.cohorts.create, {
		year: '2025-2026',
		grade: options.grade,
		...(options.level === undefined ? {} : { level: options.level }),
		classNumber: options.classNumber ?? '1'
	});
}

async function addStudent(
	t: ConvexTestInstance,
	cohortId: Id<'esl_cohorts'>,
	options: { schoolStudentId?: string; chineseClass?: string; status?: 'active' | 'disabled' } = {}
) {
	return t.run((ctx) =>
		ctx.db.insert('esl_students', {
			cohortId,
			chineseName: '學生',
			schoolStudentId: options.schoolStudentId ?? '7001001',
			chineseClass: options.chineseClass,
			status: options.status ?? 'active',
			enrolledAt: 1
		})
	);
}

describe('esl year readiness and sign-off', () => {
	afterEach(() => vi.restoreAllMocks());

	it('starts unconfirmed and reports the checklist', async () => {
		const t = await asEslAdmin();
		const cohort = await createCohort(t);
		await addStudent(t, cohort.cohortId, { chineseClass: '01' });

		const readiness = await t.query(api.esl.yearStatus.readiness, { year: '2025-2026' });

		expect(readiness.confirmed).toBe(false);
		expect(readiness.confirmedReason).toBeNull();
		expect(readiness.canConfirm).toBe(true);
		expect(readiness.blockers).toEqual([]);
		expect(readiness.grades.find((grade: { grade: number }) => grade.grade === 7)).toMatchObject({
			cohorts: 1,
			activeStudents: 1,
			missingHomerooms: 0
		});
		// G8–G10 have no cohorts yet; the checklist warns rather than blocks.
		expect(readiness.warnings.map((warning: { kind: string }) => warning.kind)).toContain(
			'no-cohorts'
		);
	});

	it('blocks sign-off while an active student has no Chinese homeroom', async () => {
		const t = await asEslAdmin();
		const cohort = await createCohort(t);
		await addStudent(t, cohort.cohortId, { chineseClass: '01' });
		await addStudent(t, cohort.cohortId, { schoolStudentId: '7001002' });

		const readiness = await t.query(api.esl.yearStatus.readiness, { year: '2025-2026' });
		expect(readiness.canConfirm).toBe(false);
		expect(readiness.blockers.map((blocker: { kind: string }) => blocker.kind)).toEqual([
			'missing-homeroom'
		]);

		await expect(t.mutation(api.esl.yearStatus.confirm, { year: '2025-2026' })).rejects.toThrow(
			/no Chinese homeroom/
		);
	});

	it('blocks sign-off on a duplicate school student ID across cohorts', async () => {
		const t = await asEslAdmin();
		const first = await createCohort(t);
		await addStudent(t, first.cohortId, { schoolStudentId: '7001001', chineseClass: '01' });
		const second = await createCohort(t, { grade: 7, level: 'Basic', classNumber: '2' });
		await addStudent(t, second.cohortId, { schoolStudentId: '7001001', chineseClass: '02' });

		const readiness = await t.query(api.esl.yearStatus.readiness, { year: '2025-2026' });
		expect(readiness.canConfirm).toBe(false);
		const duplicate = readiness.blockers.find(
			(blocker: { kind: string }) => blocker.kind === 'duplicate-id'
		);
		expect(duplicate?.message).toContain('7001001');
	});

	it('ignores a disabled student when checking homerooms and duplicates', async () => {
		const t = await asEslAdmin();
		const cohort = await createCohort(t);
		await addStudent(t, cohort.cohortId, { chineseClass: '01' });
		await addStudent(t, cohort.cohortId, {
			schoolStudentId: '7001002',
			status: 'disabled'
		});

		const readiness = await t.query(api.esl.yearStatus.readiness, { year: '2025-2026' });
		expect(readiness.canConfirm).toBe(true);
		expect(readiness.blockers).toEqual([]);
	});

	it('warns about a cohort with no active students', async () => {
		const t = await asEslAdmin();
		const cohort = await createCohort(t);
		await addStudent(t, cohort.cohortId, { chineseClass: '01' });
		await createCohort(t, { grade: 7, level: 'Basic', classNumber: '2' });

		const readiness = await t.query(api.esl.yearStatus.readiness, { year: '2025-2026' });
		expect(readiness.canConfirm).toBe(true);
		expect(readiness.warnings.map((warning: { kind: string }) => warning.kind)).toContain(
			'empty-cohort'
		);
	});

	it('records who confirmed the year and allows unconfirm', async () => {
		const t = await convexTest(schema, modules);
		const adminId = await seedEslStaff(t, {
			authId: 'esl-admin',
			name: 'Ada Admin',
			eslRole: 'admin'
		});
		const cohort = await createCohort(t);
		await addStudent(t, cohort.cohortId, { chineseClass: '01' });

		await t.mutation(api.esl.yearStatus.confirm, { year: '2025-2026' });
		let readiness = await t.query(api.esl.yearStatus.readiness, { year: '2025-2026' });
		expect(readiness.confirmed).toBe(true);
		expect(readiness.confirmedReason).toBe('signoff');
		expect(readiness.confirmedBy).toBe('Ada Admin');
		expect(readiness.confirmedAt).toEqual(expect.any(Number));

		const signoff = await t.run((ctx) => ctx.db.query('esl_year_signoffs').first());
		expect(signoff?.confirmedBy).toBe(adminId);

		await t.mutation(api.esl.yearStatus.unconfirm, { year: '2025-2026' });
		readiness = await t.query(api.esl.yearStatus.readiness, { year: '2025-2026' });
		expect(readiness.confirmed).toBe(false);
	});

	it('treats an unconfirmed year with meetings as confirmed for the gate', async () => {
		const t = await asEslAdmin();
		const cohort = await createCohort(t);
		await addStudent(t, cohort.cohortId, { chineseClass: '01' });
		await t.run((ctx) =>
			ctx.db.insert('esl_class_meetings', {
				classId: cohort.classIds[0],
				year: '2025-2026',
				day: 'Monday',
				period: 1
			})
		);

		const readiness = await t.query(api.esl.yearStatus.readiness, { year: '2025-2026' });
		expect(readiness.confirmed).toBe(true);
		expect(readiness.confirmedReason).toBe('existing-meetings');
	});

	it('refuses sign-off to an ESL teacher', async () => {
		const t = await asEslAdmin();
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });

		await expect(t.mutation(api.esl.yearStatus.confirm, { year: '2025-2026' })).rejects.toThrow(
			/ESL admin access required/
		);
	});
});
