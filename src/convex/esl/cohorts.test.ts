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
				level: 'Intermediate',
				classNumber: '1'
			});

			expect(classIds).toHaveLength(1);
			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });
			expect(classes).toHaveLength(1);
			expect(classes[0].type).toBe('G9');
		});

		/**
		 * Grade 10 is not levelled: its cohort is a base class (H101) taught by
		 * two sections, H101A and H101B, which share that one roster.
		 */
		it('composes one class for a G10 cohort, named for its level', async () => {
			const t = await asEslAdmin();

			const { cohortId, classIds } = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'A',
				classNumber: '01'
			});

			expect(classIds).toHaveLength(1);
			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });
			expect(classes.map((c: { name: string }) => c.name)).toEqual(['H101A']);
			// One class: a cohort is one ability band of one Chinese class, and B is a
			// different cohort with a different roster (ADR-0023).
			expect(classes.every((c: { cohortId: string }) => c.cohortId === cohortId)).toBe(true);
		});

		it('creates a separate cohort and class for each level of one base class', async () => {
			// The property that matters most here, and the one that was wrong: A and B
			// are ability bands, so they are two cohorts with two rosters rather than one
			// cohort with two classes over it (ADR-0023).
			const t = await asEslAdmin();

			const a = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'A',
				classNumber: '01'
			});
			const b = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'B',
				classNumber: '01'
			});

			expect(a.cohortId).not.toBe(b.cohortId);
			const aClasses = await t.query(api.esl.classes.listByCohort, { cohortId: a.cohortId });
			const bClasses = await t.query(api.esl.classes.listByCohort, { cohortId: b.cohortId });
			expect(aClasses.map((c: { name: string }) => c.name)).toEqual(['H101A']);
			expect(bClasses.map((c: { name: string }) => c.name)).toEqual(['H101B']);
		});
		it('names G10 classes H10<base><level> across the whole base-class range', async () => {
			const t = await asEslAdmin();

			const { cohortId } = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'A',
				classNumber: '10'
			});

			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });
			expect(classes.map((c: { name: string }) => c.name)).toEqual(['H110A']);
		});

		it('stores the ability level on a G10 cohort', async () => {
			const t = await asEslAdmin();

			const { cohortId } = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'A',
				classNumber: '03'
			});

			const cohort = await t.query(api.esl.cohorts.getById, { id: cohortId });
			expect(cohort?.level).toBe('A');
			// `code` is derived per read, not a stored column.
			expect(cohort?.code).toBe('G10-03A');
		});

		it('accepts a base class beyond the old fixed list', async () => {
			// The school decides how many base classes it runs each year.
			const t = await asEslAdmin();

			const { cohortId } = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'A',
				classNumber: '12'
			});

			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });
			expect(classes.map((c: { name: string }) => c.name)).toEqual(['H112A']);
		});

		it('accepts an unpadded base class and stores it padded', async () => {
			const t = await asEslAdmin();

			const { cohortId } = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'A',
				classNumber: '2'
			});

			const cohort = await t.query(api.esl.cohorts.getById, { id: cohortId });
			expect(cohort?.classNumber).toBe('02');
			expect(cohort?.code).toBe('G10-02A');
		});

		it('treats a padded and unpadded base class as the same cohort', async () => {
			const t = await asEslAdmin();
			await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'A',
				classNumber: '05'
			});

			await expect(
				t.mutation(api.esl.cohorts.create, {
					year: '2025-2026',
					grade: 10,
					level: 'A',
					classNumber: '5'
				})
			).rejects.toThrow('already exists');
		});

		it('rejects a grade 10 base class beyond the name-format bound', async () => {
			const t = await asEslAdmin();

			await expect(
				t.mutation(api.esl.cohorts.create, {
					year: '2025-2026',
					grade: 10,
					level: 'A',
					classNumber: '100'
				})
			).rejects.toThrow('Class number must be 1-99');
		});

		it('rejects a level a G10 cohort cannot have', async () => {
			const t = await asEslAdmin();

			await expect(
				t.mutation(api.esl.cohorts.create, {
					year: '2025-2026',
					grade: 10,
					level: 'Advanced',
					classNumber: '01'
				})
			).rejects.toThrow('Grade 10 level must be one of A, B');
		});

		it('rejects a grade 10 base class outside the name-format bound', async () => {
			const t = await asEslAdmin();

			await expect(
				t.mutation(api.esl.cohorts.create, {
					year: '2025-2026',
					grade: 10,
					level: 'A',
					classNumber: '100'
				})
			).rejects.toThrow('Class number must be 1-99');
		});

		it('rejects a G10 base class number on a levelled grade', async () => {
			const t = await asEslAdmin();

			await expect(
				t.mutation(api.esl.cohorts.create, {
					year: '2025-2026',
					grade: 7,
					level: 'Basic',
					classNumber: '03'
				})
			).rejects.toThrow('Class number must be one of 1, 2');
		});

		it('rejects a missing level on a levelled grade', async () => {
			const t = await asEslAdmin();

			await expect(
				t.mutation(api.esl.cohorts.create, {
					year: '2025-2026',
					grade: 9,
					classNumber: '1'
				})
			).rejects.toThrow('Level must be one of');
		});

		it('keeps each G10 base class distinct within a year', async () => {
			const t = await asEslAdmin();
			await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'A',
				classNumber: '01'
			});

			// A different base class is a different cohort, not a duplicate.
			const second = await t.mutation(api.esl.cohorts.create, {
				year: '2025-2026',
				grade: 10,
				level: 'A',
				classNumber: '02'
			});
			expect(second.cohortId).toBeDefined();

			await expect(
				t.mutation(api.esl.cohorts.create, {
					year: '2025-2026',
					grade: 10,
					level: 'A',
					classNumber: '01'
				})
			).rejects.toThrow('already exists');
		});

		it('names the auto-composed classes after the cohort', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const classes = await t.query(api.esl.classes.listByCohort, { cohortId });

			expect(classes.map((c: { name: string }) => c.name).sort()).toEqual([
				'G7 Basic 1 CLIL',
				'G7 Basic 1 Comm'
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
				level: 'Advanced',
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
