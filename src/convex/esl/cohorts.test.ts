import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest, modules, mockAuthUser, seedUser, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';

/** An ESL admin: may create, pair, and update cohorts. */
async function asEslAdmin(authId = 'esl-admin') {
	const t = convexTest(schema, modules);
	await seedEslStaff(t, { authId, eslRole: 'admin' });
	return t;
}

/** An ESL teacher: may read cohorts, may not write them. */
async function asEslTeacher(authId = 'esl-teacher') {
	const t = convexTest(schema, modules);
	await seedEslStaff(t, { authId, eslRole: 'teacher' });
	return t;
}

/** Creates a G7 cohort through the public mutation (admin required). */
async function createG7(t: ReturnType<typeof convexTest>, level = 'Basic') {
	return t.mutation(api.esl.cohorts.create, {
		year: '2025-2026',
		grade: 7,
		level,
		classNumber: '1'
	});
}

describe('esl cohorts', () => {
	afterEach(() => vi.restoreAllMocks());

	describe('create', () => {
		it('auto-composes a paired CLIL and Comm class for a G7 cohort', async () => {
			const t = await asEslAdmin();

			const { cohortId, classIds } = await createG7(t);

			expect(classIds).toHaveLength(2);
			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });
			expect(classes.map((c: { type: string }) => c.type).sort()).toEqual(['CLIL', 'Comm']);
			// Both classes point at one cohort — that is what shares the roster.
			expect(classes.every((c: { cohortId: string }) => c.cohortId === cohortId)).toBe(true);
		});

		it('auto-composes a single class for a G9 cohort', async () => {
			const t = await asEslAdmin();

			const { cohortId, classIds } = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 9,
				level: 'Int',
				classNumber: '1'
			});

			expect(classIds).toHaveLength(1);
			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });
			expect(classes).toHaveLength(1);
			expect(classes[0].type).toBe('G9');
		});

		it('auto-composes a single H10 class for a G10 cohort', async () => {
			const t = await asEslAdmin();

			const { classIds } = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'Adv',
				classNumber: '1'
			});

			expect(classIds).toHaveLength(1);
		});

		it('names the auto-composed classes after the cohort', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });

			expect(classes.map((c: { name: string }) => c.name).sort()).toEqual([
				'G7/8 CLIL Basic 1',
				'G7/8 Comm Basic 1'
			]);
		});

		it('rejects a duplicate cohort in the same year', async () => {
			const t = await asEslAdmin();
			await createG7(t);

			await expect(createG7(t)).rejects.toThrow('already exists');
		});

		it('allows the same cohort in a different year', async () => {
			const t = await asEslAdmin();
			await createG7(t);

			const second = await t.mutation(api.esl.cohorts.create, {
				year: '2026-2027',
				grade: 7,
				level: 'Basic',
				classNumber: '1'
			});

			expect(second.cohortId).toBeDefined();
		});

		it('rejects an unsupported grade', async () => {
			const t = await asEslAdmin();

			await expect(
				t.mutation(api.esl.cohorts.create, {
					year: '2025-2026',
					grade: 6,
					level: 'Basic',
					classNumber: '1'
				})
			).rejects.toThrow('Grade must be 7, 8, 9 or 10');
		});

		it('rejects a malformed school year', async () => {
			const t = await asEslAdmin();

			await expect(
				t.mutation(api.esl.cohorts.create, {
					year: '2025',
					grade: 7,
					level: 'Basic',
					classNumber: '1'
				})
			).rejects.toThrow('Year must be in YYYY-YYYY form');
		});

		it('rejects an unknown level', async () => {
			const t = await asEslAdmin();

			await expect(
				t.mutation(api.esl.cohorts.create, {
					year: '2025-2026',
					grade: 7,
					level: 'Wizard',
					classNumber: '1'
				})
			).rejects.toThrow('Level must be one of');
		});

		it('rejects a write from an ESL teacher', async () => {
			const t = await asEslTeacher();

			await expect(createG7(t)).rejects.toThrow('Forbidden: ESL admin access required');
		});

		it('rejects a write from an International-only admin', async () => {
			const t = convexTest(schema, modules);
			await seedUser(t, {
				authId: 'intl-admin',
				role: 'admin',
				status: 'active',
				departmentRoles: { international: 'admin' }
			});
			mockAuthUser({ authId: 'intl-admin' });

			await expect(createG7(t)).rejects.toThrow('Forbidden: ESL admin access required');
		});
	});

	describe('list', () => {
		it('returns cohorts with their classes and a display label', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const cohorts = await t.query(api.esl.cohorts.list, { year: '2025-2026' });

			expect(cohorts).toHaveLength(1);
			expect(cohorts[0]._id).toBe(cohortId);
			expect(cohorts[0].label).toBe('2025-2026 G7 Basic 1');
			expect(cohorts[0].classes).toHaveLength(2);
		});

		it('filters by grade', async () => {
			const t = await asEslAdmin();
			await createG7(t);
			await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 9,
				level: 'Basic',
				classNumber: '1'
			});

			const cohorts = await t.query(api.esl.cohorts.list, { grade: 9 });

			expect(cohorts).toHaveLength(1);
			expect(cohorts[0].grade).toBe(9);
		});

		it('sorts cohorts by grade, then level difficulty', async () => {
			const t = await asEslAdmin();
			const g9 = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 9,
				level: 'Basic',
				classNumber: '1'
			});
			const g7Adv = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 7,
				level: 'Adv',
				classNumber: '1'
			});
			const g7Basic = await createG7(t);

			const cohorts = await t.query(api.esl.cohorts.list, {});

			// Grade ascends, and within a grade the easier level comes first.
			expect(cohorts.map((c: { _id: string }) => c._id)).toEqual([
				g7Basic.cohortId,
				g7Adv.cohortId,
				g9.cohortId
			]);
		});

		it('returns a single cohort with its classes', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const cohort = await t.query(api.esl.cohorts.getById, { id: cohortId });

			expect(cohort?.label).toBe('2025-2026 G7 Basic 1');
			expect(cohort?.classes).toHaveLength(2);
		});

		it('returns null for a deleted cohort', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await t.run((ctx) => ctx.db.delete(cohortId));

			const cohort = await t.query(api.esl.cohorts.getById, { id: cohortId });

			expect(cohort).toBeNull();
		});

		it('rejects a read from an unauthenticated caller', async () => {
			const t = convexTest(schema, modules);
			mockAuthUser(null);

			await expect(t.query(api.esl.cohorts.list, {})).rejects.toThrow('Unauthorized');
		});

		it('rejects a read from an International-only teacher', async () => {
			const t = convexTest(schema, modules);
			await seedUser(t, {
				authId: 'intl-teacher',
				role: 'teacher',
				status: 'active',
				departmentRoles: { international: 'teacher' }
			});
			mockAuthUser({ authId: 'intl-teacher' });

			await expect(t.query(api.esl.cohorts.list, {})).rejects.toThrow(
				'Forbidden: ESL staff access required'
			);
		});
	});

	describe('pairClasses', () => {
		it('recreates a missing Comm class so the G7 pair is whole again', async () => {
			const t = await asEslAdmin();
			const { cohortId, classIds } = await createG7(t);
			const commId = await t.run(async (ctx) => {
				const comm = await ctx.db.get(classIds[1]);
				if (comm?.type !== 'Comm') throw new Error('expected the second class to be Comm');
				await ctx.db.delete(comm._id);
				return comm._id;
			});

			const result = await t.mutation(api.esl.cohorts.pairClasses, { cohortId });

			expect(result.created).toHaveLength(1);
			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });
			expect(classes.map((c: { type: string }) => c.type).sort()).toEqual(['CLIL', 'Comm']);
			expect(classes.some((c: { _id: string }) => c._id === commId)).toBe(false);
		});

		it('is idempotent — re-pairing an intact cohort changes nothing', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const result = await t.mutation(api.esl.cohorts.pairClasses, { cohortId });

			expect(result).toEqual({ created: [], restored: [], archived: [] });
			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });
			expect(classes).toHaveLength(2);
		});

		it('restores an archived class rather than duplicating it', async () => {
			const t = await asEslAdmin();
			const { cohortId, classIds } = await createG7(t);
			await t.mutation(api.esl.classes.setStatus, { id: classIds[0], status: 'archived' });

			const result = await t.mutation(api.esl.cohorts.pairClasses, { cohortId });

			expect(result.restored).toEqual([classIds[0]]);
			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });
			expect(classes).toHaveLength(2);
			expect(classes.every((c: { status: string }) => c.status === 'active')).toBe(true);
		});

		it('rejects pairing from an ESL teacher', async () => {
			const admin = await asEslAdmin();
			const { cohortId } = await createG7(admin);
			const t = await asEslTeacher();

			await expect(t.mutation(api.esl.cohorts.pairClasses, { cohortId })).rejects.toThrow(
				'Forbidden: ESL admin access required'
			);
		});
	});

	describe('update', () => {
		it('archives a cohort', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			await t.mutation(api.esl.cohorts.update, { id: cohortId, status: 'archived' });

			const cohort = await t.query(api.esl.cohorts.getById, { id: cohortId });
			expect(cohort?.status).toBe('archived');
		});

		it('refuses to archive an unknown cohort', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await t.run((ctx) => ctx.db.delete(cohortId));

			await expect(
				t.mutation(api.esl.cohorts.update, { id: cohortId, status: 'archived' })
			).rejects.toThrow('Cohort not found');
		});
	});
});
