import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	convexTest,
	modules,
	mockAuthUser,
	seedEslStaff,
	type ConvexTestInstance
} from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';

async function asEslAdmin(authId = 'esl-admin') {
	const t = convexTest(schema, modules);
	await seedEslStaff(t, { authId, eslRole: 'admin' });
	return t;
}

/** One cohort in each of two years, so archiving one cannot touch the other. */
async function seedTwoYears(t: ConvexTestInstance) {
	const last = await t.mutation(api.esl.cohorts.create, {
		year: '2024-2025',
		grade: 7,
		level: 'Basic',
		classNumber: '1'
	});
	const thisYear = await t.mutation(api.esl.cohorts.create, {
		year: '2025-2026',
		grade: 7,
		level: 'Basic',
		classNumber: '1'
	});
	return { last, thisYear };
}

/** Every lifecycle status in a year, cohorts and their classes alike. */
const statuses = async (t: ConvexTestInstance, year: string) =>
	t.run(async (ctx) => {
		const cohorts = await ctx.db
			.query('esl_cohorts')
			.withIndex('by_year', (q) => q.eq('year', year))
			.collect();
		const classes = (
			await Promise.all(
				cohorts.map((c) =>
					ctx.db
						.query('esl_classes')
						.withIndex('by_cohortId', (q) => q.eq('cohortId', c._id))
						.collect()
				)
			)
		).flat();
		return {
			cohorts: cohorts.map((c) => c.status),
			classes: classes.map((c) => c.status)
		};
	});

/**
 * The years of a `cohorts.list` result, in the order the query returned them.
 *
 * Takes the rows as a parameter with an explicit shape rather than relying on the
 * query's inferred return type: `src/convex/tsconfig.json` — the config Convex's
 * own push typecheck uses — does not resolve it here, and `noImplicitAny` then
 * rejects an inline `cohorts.map((c) => c.year)` parameter. It also states once
 * what these assertions actually care about, which is the years and their order.
 */
function yearsOf(cohorts: readonly { year: string }[]): string[] {
	return cohorts.map((cohort) => cohort.year);
}

describe('esl cohort archival', () => {
	afterEach(() => vi.restoreAllMocks());

	describe('archiveYear', () => {
		it('archives a whole year and cascades to its classes', async () => {
			const t = await asEslAdmin();
			await seedTwoYears(t);

			const report = await t.mutation(api.esl.cohorts.archiveYear, {
				year: '2024-2025'
			});

			expect(report).toMatchObject({ year: '2024-2025', cohorts: 1, classes: 2 });
			expect(await statuses(t, '2024-2025')).toEqual({
				cohorts: ['archived'],
				classes: ['archived', 'archived']
			});
		});

		it('leaves other years alone', async () => {
			const t = await asEslAdmin();
			await seedTwoYears(t);

			await t.mutation(api.esl.cohorts.archiveYear, { year: '2024-2025' });

			expect(await statuses(t, '2025-2026')).toEqual({
				cohorts: ['active'],
				classes: ['active', 'active']
			});
		});

		// Archiving is a claim that a year is over, not a deletion, so the
		// roster survives it.
		it('leaves the students of the archived year enrolled', async () => {
			const t = await asEslAdmin();
			const { last } = await seedTwoYears(t);
			await t.mutation(api.esl.students.create, {
				cohortId: last.cohortId,
				englishName: 'Alice Chan',
				chineseName: '陳小美',
				schoolStudentId: '115001',
				chineseClass: 'J101'
			});

			await t.mutation(api.esl.cohorts.archiveYear, { year: '2024-2025' });

			const roster = await t.query(api.esl.classes.getRoster, {
				classId: last.classIds[0]
			});
			expect(roster.students).toHaveLength(1);
		});

		it('is harmless when run twice', async () => {
			const t = await asEslAdmin();
			await seedTwoYears(t);

			await t.mutation(api.esl.cohorts.archiveYear, { year: '2024-2025' });
			const second = await t.mutation(api.esl.cohorts.archiveYear, {
				year: '2024-2025'
			});

			expect(second).toMatchObject({ cohorts: 1 });
			expect((await statuses(t, '2024-2025')).cohorts).toEqual(['archived']);
		});

		it('reports zero for a year with no cohorts', async () => {
			const t = await asEslAdmin();

			await expect(
				t.mutation(api.esl.cohorts.archiveYear, { year: '1999-2000' })
			).resolves.toMatchObject({ cohorts: 0, classes: 0 });
		});

		it('rejects a year that is not a school year', async () => {
			const t = await asEslAdmin();

			await expect(t.mutation(api.esl.cohorts.archiveYear, { year: 'last year' })).rejects.toThrow(
				'YYYY-YYYY'
			);
		});

		it('refuses a caller who is not an ESL admin', async () => {
			const t = await asEslAdmin();
			await seedTwoYears(t);
			mockAuthUser(null);

			await expect(t.mutation(api.esl.cohorts.archiveYear, { year: '2024-2025' })).rejects.toThrow(
				'Unauthorized'
			);
		});
	});

	describe('restoreYear', () => {
		it('brings an archived year back', async () => {
			const t = await asEslAdmin();
			await seedTwoYears(t);

			await t.mutation(api.esl.cohorts.archiveYear, { year: '2024-2025' });
			await t.mutation(api.esl.cohorts.restoreYear, { year: '2024-2025' });

			expect(await statuses(t, '2024-2025')).toEqual({
				cohorts: ['active'],
				classes: ['active', 'active']
			});
		});
	});

	describe('list', () => {
		it('hides archived cohorts by default', async () => {
			const t = await asEslAdmin();
			await seedTwoYears(t);
			await t.mutation(api.esl.cohorts.archiveYear, { year: '2024-2025' });

			const cohorts = await t.query(api.esl.cohorts.list, {});

			expect(yearsOf(cohorts)).toEqual(['2025-2026']);
		});

		it('returns archived cohorts when asked for them', async () => {
			const t = await asEslAdmin();
			await seedTwoYears(t);
			await t.mutation(api.esl.cohorts.archiveYear, { year: '2024-2025' });

			const cohorts = await t.query(api.esl.cohorts.list, { status: 'archived' });

			expect(yearsOf(cohorts)).toEqual(['2024-2025']);
		});

		it('returns both when asked for all of them', async () => {
			const t = await asEslAdmin();
			await seedTwoYears(t);
			await t.mutation(api.esl.cohorts.archiveYear, { year: '2024-2025' });

			const cohorts = await t.query(api.esl.cohorts.list, { status: 'all' });

			expect(yearsOf(cohorts)).toEqual(['2025-2026', '2024-2025']);
		});

		it('narrows by year and status together', async () => {
			const t = await asEslAdmin();
			await seedTwoYears(t);
			await t.mutation(api.esl.cohorts.archiveYear, { year: '2024-2025' });

			const cohorts = await t.query(api.esl.cohorts.list, {
				year: '2024-2025',
				status: 'active'
			});

			expect(cohorts).toHaveLength(0);
		});
	});
});
