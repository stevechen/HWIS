import { query } from '../_generated/server';
import { v } from 'convex/values';
import { requireEslAdmin } from '../auth';
import { cohortLabel, deriveHomeroom } from '../shared/esl';

/** Existing Chinese classes and ESL cohorts for one grade in one school year. */
export const options = query({
	args: { year: v.string(), grade: v.number() },
	returns: v.object({
		chineseClasses: v.array(v.string()),
		cohortsByChineseClass: v.array(
			v.object({
				chineseClass: v.string(),
				cohorts: v.array(v.object({ cohortId: v.id('esl_cohorts'), label: v.string() }))
			})
		)
	}),
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);
		const cohorts = (
			await ctx.db
				.query('esl_cohorts')
				.withIndex('by_year_grade', (q) => q.eq('year', args.year).eq('grade', args.grade))
				.take(100)
		).filter((cohort) => cohort.status === 'active');

		const cohortClasses = await Promise.all(
			cohorts.map(async (cohort) => {
				const students = await ctx.db
					.query('esl_students')
					.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
					.take(500);
				return {
					cohort,
					homerooms: new Set(
						students.flatMap((student) => {
							if (student.status !== 'active') return [];
							const homeroom = deriveHomeroom(args.grade, student.chineseClass ?? '');
							return homeroom === null ? [] : [homeroom];
						})
					)
				};
			})
		);
		const chineseClasses = [
			...new Set(cohortClasses.flatMap(({ homerooms }) => [...homerooms]))
		].sort();

		return {
			chineseClasses,
			cohortsByChineseClass: chineseClasses.map((chineseClass) => ({
				chineseClass,
				cohorts: cohortClasses
					.filter(({ homerooms }) => homerooms.has(chineseClass))
					.map(({ cohort }) => ({ cohortId: cohort._id, label: cohortLabel(cohort) }))
			}))
		};
	}
});
