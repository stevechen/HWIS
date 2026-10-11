import { internalMutation, mutation, query, type MutationCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import {
	ESL_CLASS_NUMBERS,
	ESL_GRADE10_LEVELS,
	ESL_GRADE10_MAX_CLASS_NUMBER,
	ESL_LEVELS,
	classTypesForCohort,
	cohortCode,
	compareEslCohorts,
	cohortLabel,
	defaultClassName,
	grade10BaseClass,
	isGrade10Level,
	isLevelledGrade,
	isValidEslClassNumber,
	isValidEslGrade,
	isValidEslLevel,
	isValidGrade10ClassNumber,
	isValidSchoolYear,
	planLegacyGrade10Repair,
	planLegacyLevelRepair
} from '../shared/esl';

/**
 * Rejects cohorts that fall outside the ESL programme's grade grid.
 *
 * Level is required for the levelled grades and rejected for grade 10, which
 * has none; the valid class numbers differ per grade too (1–2 vs 01–10).
 */
function assertValidCohortKey(key: {
	year: string;
	grade: number;
	level?: string;
	classNumber: string;
}): void {
	if (!isValidSchoolYear(key.year)) {
		throw new Error('Year must be in YYYY-YYYY form');
	}
	if (!isValidEslGrade(key.grade)) {
		throw new Error('Grade must be 7, 8, 9 or 10');
	}
	if (isLevelledGrade(key.grade)) {
		if (!isValidEslLevel(key.level ?? '')) {
			throw new Error(`Level must be one of ${ESL_LEVELS.join(', ')}`);
		}
		if (!isValidEslClassNumber(key.classNumber)) {
			throw new Error(`Class number must be one of ${ESL_CLASS_NUMBERS.join(', ')}`);
		}
		return;
	}
	// Grade 10 is levelled too, by A or B rather than by name: the level is part of
	// the cohort's identity, since one Chinese class at one level is one cohort
	// with one roster (ADR-0023). The class number is the Chinese class, and one
	// outside the range the school runs would produce a class name that does not
	// exist in the programme.
	if (!isGrade10Level(key.level ?? '')) {
		throw new Error(`Grade 10 level must be one of ${ESL_GRADE10_LEVELS.join(', ')}`);
	}
	if (!isValidGrade10ClassNumber(key.classNumber)) {
		throw new Error(`Class number must be 1-${ESL_GRADE10_MAX_CLASS_NUMBER}`);
	}
}

/**
 * List cohorts, optionally narrowed to a year, a grade, and a lifecycle state.
 *
 * **Archived cohorts are excluded by default.** Archiving a year is a claim that
 * it is over, and a list that still returns it makes that claim invisible — the
 * admin sees last year's classes beside this year's with nothing but a badge to
 * explain the difference. Pass `status` explicitly to ask for them: `archived`
 * for a retired year on its own, `all` for both.
 *
 * The default also keeps the Students page's cohort dropdown to the current year
 * without that page having to know anything about archival, and stops accumulated
 * years consuming the row limit below.
 *
 * cost: 1 indexed take of N cohorts + 1 batched read of their classes + 1 indexed
 * read per cohort for its roster size. Free-Quota Impact: N is the cohort count
 * (tens); both per-cohort reads go through `by_cohortId`, never a full scan.
 */
export const list = query({
	args: {
		year: v.optional(v.string()),
		grade: v.optional(v.number()),
		status: v.optional(v.union(v.literal('active'), v.literal('archived'), v.literal('all')))
	},
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const cohorts =
			args.year !== undefined
				? await ctx.db
						.query('esl_cohorts')
						.withIndex('by_year', (q) => q.eq('year', args.year as string))
						.take(100)
				: await ctx.db.query('esl_cohorts').withIndex('by_year').order('desc').take(100);

		// Filtered before the class reads below, so a narrowed list does not pay for
		// the classes of cohorts it is about to drop. An omitted `status` means
		// `active` — the filter is the default, not an opt-in.
		const wantedStatus = args.status ?? 'active';
		const visible = cohorts.filter((cohort) => {
			if (args.grade !== undefined && cohort.grade !== args.grade) return false;
			if (wantedStatus !== 'all' && cohort.status !== wantedStatus) return false;
			return true;
		});

		const classesByCohort = await Promise.all(
			visible.map((cohort) =>
				ctx.db
					.query('esl_classes')
					.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
					.collect()
			)
		);

		/**
		 * Active students per cohort, for the card's headcount.
		 *
		 * Read here rather than in the browser because the count is a property of the
		 * cohort: grades 7 and 8 are taught by a `CLIL` and a `Comm` class drawing one
		 * roster, so both cards show the same number, and it is the roster's size that
		 * a coordinator is asking about (ADR-0023). Reading it per cohort rather than
		 * per class is what makes that shared figure fall out for free.
		 *
		 * Active only, matching `esl/students.listByCohort`: a transferred or disabled
		 * student is history, and counting them would make a class look fuller than
		 * the room it sits in.
		 *
		 * Read in the same pass as the classes so it costs one more indexed read per
		 * cohort rather than a second query from the browser.
		 */
		const studentCountByCohort = await Promise.all(
			visible.map(async (cohort) => {
				const students = await ctx.db
					.query('esl_students')
					.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
					.take(500);
				return students.filter((student) => student.status === 'active').length;
			})
		);

		return visible
			.map((cohort, index) => ({
				...cohort,
				// Derived, not stored: a `code` column would be a required
				// field that every pre-existing cohort row would fail.
				code: cohortCode(cohort),
				label: cohortLabel(cohort),
				classes: classesByCohort[index],
				studentCount: studentCountByCohort[index]
			}))
			.sort(compareEslCohorts);
	}
});

/** A single cohort with its classes. cost: 1 point read + 1 indexed read. */
export const getById = query({
	args: { id: v.id('esl_cohorts') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const cohort = await ctx.db.get(args.id);
		if (!cohort) return null;

		const classes = await ctx.db
			.query('esl_classes')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', args.id))
			.collect();

		return { ...cohort, code: cohortCode(cohort), label: cohortLabel(cohort), classes };
	}
});

/**
 * Create a cohort and auto-compose the classes that teach it.
 *
 * A G7/G8 cohort is born already paired: one `CLIL` and one `Comm` class
 * pointing at the same cohort, so they share the roster by construction.
 * A G10 cohort is likewise paired — its `A` and `B` sections, H101A and
 * H101B, both draw that base class's students in different rooms. A G9 cohort
 * gets its single class.
 *
 * cost: 1 indexed uniqueness lookup + (1 + #classes) inserts.
 */
export const create = mutation({
	args: {
		year: v.string(),
		grade: v.number(),
		/** Required for the levelled grades; omit for grade 10, which has none. */
		level: v.optional(v.string()),
		classNumber: v.string(),
		/** Set only by end-to-end runs, so a test cohort can be removed by tag. */
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);
		assertValidCohortKey(args);

		const key = {
			year: args.year,
			grade: args.grade,
			// Grade 10's level is A or B, and it is part of the identity like the
			// levelled grades' level name is.
			...(args.level ? { level: args.level } : {}),
			// The base class is stored zero-padded, so `2` and `02` are one cohort
			// rather than two.
			classNumber: isLevelledGrade(args.grade)
				? args.classNumber
				: grade10BaseClass(args.classNumber)
		};
		const duplicate = await ctx.db
			.query('esl_cohorts')
			.withIndex('by_year_grade_level_classNumber', (q) =>
				q
					.eq('year', args.year)
					.eq('grade', args.grade)
					.eq('level', key.level)
					.eq('classNumber', key.classNumber)
			)
			.first();
		if (duplicate) {
			throw new Error(`Cohort ${cohortLabel(key)} already exists`);
		}

		const now = Date.now();
		const cohortId = await ctx.db.insert('esl_cohorts', {
			...key,
			status: 'active',
			createdAt: now,
			// End-to-end runs only; a real creation leaves it absent.
			...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
		});

		const classIds: Id<'esl_classes'>[] = [];
		for (const type of classTypesForCohort(key)) {
			classIds.push(
				await ctx.db.insert('esl_classes', {
					cohortId,
					type,
					name: defaultClassName(key, type),
					status: 'active',
					createdAt: now
				})
			);
		}

		return { cohortId, classIds };
	}
});

/**
 * One-off repair for rows written before the grade 10 model was corrected.
 *
 * The old model had a single `H10` class type and a level on every cohort,
 * including grade 10. Grade 10 is not levelled and is taught by two sections,
 * `H10A` and `H10B`, so:
 *
 *  - every `H10` class becomes its cohort's `A` section, renamed to the `H10nA`
 *    form; and
 *  - every grade 10 cohort drops its level, which no longer exists for it.
 *
 * Idempotent: rows already in the new shape produce no writes. Run once per
 * deployment: `bunx convex run esl/cohorts:repairLegacyGrade10`
 *
 * The reads are deliberately tolerant — a row that fails the current
 * validator still comes back as plain data, which is the only way to repair
 * the rows that violate it.
 */
export const repairLegacyGrade10 = internalMutation({
	args: {},
	handler: async (ctx) => {
		// Reads are deliberately tolerant: a row that fails the current
		// validator still comes back as plain data, which is the only way to
		// reach the rows that violate it.
		const cohorts = await ctx.db.query('esl_cohorts').collect();
		const classes = await ctx.db.query('esl_classes').collect();

		const plan = planLegacyGrade10Repair(cohorts, classes);

		for (const patch of plan.cohorts) {
			await ctx.db.patch(patch.id as Id<'esl_cohorts'>, {
				level: patch.level,
				classNumber: patch.classNumber
			});
		}
		for (const patch of plan.classes) {
			await ctx.db.patch(patch.id as Id<'esl_classes'>, {
				type: patch.type,
				name: patch.name
			});
		}

		return {
			patchedCohorts: plan.cohorts.map((c) => c.id),
			patchedClasses: plan.classes.map((c) => c.id)
		};
	}
});

/**
 * Rewrite cohort levels stored under the old short vocabulary onto the
 * department's official level names.
 *
 * A cohort still on `Int` or `Adv` would be excluded from level-filtered reads
 * and would sort last, because neither `compareEslCohorts` nor the level
 * predicates know the short forms.
 *
 * Idempotent: a cohort already on an official name produces no write. Run once
 * after deploying the official vocabulary:
 * `bunx convex run esl/cohorts:repairLegacyLevels`
 *
 * `unrecognised` is returned rather than thrown on, so a level the alias table
 * cannot resolve is reported for a human to look at instead of being guessed —
 * coercing it would silently misfile a roster.
 */
export const repairLegacyLevels = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cohorts = await ctx.db.query('esl_cohorts').collect();
		const plan = planLegacyLevelRepair(cohorts);

		for (const patch of plan.cohorts) {
			await ctx.db.patch(patch.id as Id<'esl_cohorts'>, { level: patch.level });
		}

		const patched = new Set(plan.cohorts.map((c) => c.id));
		return {
			patchedCohorts: plan.cohorts.map((c) => c.id),
			// A level still unrecognised after planning is neither rewritten nor
			// silently dropped; it is surfaced so it can be fixed at the source.
			unrecognised: cohorts
				.filter((c) => c.level !== undefined && !patched.has(c._id))
				.map((c) => ({ id: c._id, level: c.level as string }))
		};
	}
});

/**
 * Delete classes whose cohort no longer exists.
 *
 * A cohort is removed when its year is advanced, but the classes that taught it
 * are left behind pointing at an id nothing resolves to. They are invisible to
 * every read — each is listed only through the cohort it names — and, once one
 * of them predates the current class-type vocabulary, they can hold back a
 * schema push for a deployment nothing else refers to.
 *
 * Deliberately narrow: a class is only purged when its cohort is *absent*, never
 * when the cohort is merely archived, so a cohort that still has a roster cannot
 * lose the classes that teach it. Reports every id it deleted, so a purge that
 * removes more than expected is visible rather than silent.
 *
 * Run on demand: `bunx convex run esl/cohorts:purgeOrphanedClasses`
 */
export const purgeOrphanedClasses = internalMutation({
	args: {},
	handler: async (ctx) => {
		const classes = await ctx.db.query('esl_classes').collect();
		const live = new Set((await ctx.db.query('esl_cohorts').collect()).map((c) => c._id));
		const orphaned = classes.filter((c) => !live.has(c.cohortId));

		for (const cls of orphaned) {
			await ctx.db.delete(cls._id);
		}

		return {
			purged: orphaned.map((c) => ({ id: c._id, name: c.name, cohortId: c.cohortId })),
			kept: classes.length - orphaned.length
		};
	}
});

/**
 * Update a cohort's status.
 *
 * The identity fields (year/grade/level/classNumber) are deliberately not
 * mutable here: repointing a cohort would silently move an existing roster, so
 * changing a cohort's identity means creating a new one. This keeps the
 * transfer history of each roster readable.
 *
 * cost: 1 point read + 1 patch.
 */
export const update = mutation({
	args: {
		id: v.id('esl_cohorts'),
		status: v.union(v.literal('active'), v.literal('archived'))
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const cohort = await ctx.db.get(args.id);
		if (!cohort) throw new Error('Cohort not found');

		await ctx.db.patch(args.id, { status: args.status });

		return { success: true, cohortId: args.id };
	}
});

/**
 * Apply one lifecycle state to every cohort of a year, and to their classes.
 *
 * **The unit is the year, not the cohort.** A cohort is archived one at a time
 * through `update`, but the thing an admin actually retires is a school year —
 * and a year is 60–100 cohorts, so doing it row by row from the browser is
 * hundreds of sequential mutations that half-fail. One mutation is one
 * transaction.
 *
 * **Classes cascade, and this is the difference from `update`.** Archiving a
 * cohort alone leaves its classes `active`, which reads as a contradiction the
 * moment anything lists classes by status rather than through their cohort. The
 * cascade uses the same patch `classes.setStatus` performs rather than duplicating
 * it, so there is one definition of what the field means.
 *
 * **Nothing else is touched.** Rosters, classes and meetings all survive: this is
 * a claim that the year is over, not a deletion. Students stay `active` because
 * disabling four hundred rows would break every historical read and gain nothing.
 *
 * Idempotent: a cohort already on the target state is counted, not rewritten, so
 * a retry after a timeout does not half-apply or report phantom work.
 *
 * cost: 1 indexed take of the year's cohorts + 1 indexed read per cohort's
 * classes, and one patch per row that changes.
 */
async function applyYearStatus(
	ctx: MutationCtx,
	args: { year: string; status: 'active' | 'archived' }
): Promise<{ year: string; cohorts: number; classes: number }> {
	const cohorts = await ctx.db
		.query('esl_cohorts')
		.withIndex('by_year', (q) => q.eq('year', args.year))
		.collect();

	let classesChanged = 0;

	for (const cohort of cohorts) {
		if (cohort.status !== args.status) {
			await ctx.db.patch(cohort._id, { status: args.status });
		}

		const classes = await ctx.db
			.query('esl_classes')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
			.collect();
		for (const cls of classes) {
			if (cls.status === args.status) continue;
			await ctx.db.patch(cls._id, { status: args.status });
			classesChanged += 1;
		}
	}

	// Counts are of rows *examined*, not rows changed: a report that silently
	// omitted part of the work would read as "all of it worked" (ADR-0022).
	return { year: args.year, cohorts: cohorts.length, classes: classesChanged };
}

/**
 * Archive a whole school year.
 *
 * Triggered by an explicit, confirmed action on the Classes page once every grade
 * has been imported — never automatically from the last roster apply. Import
 * completion is a fact the browser holds in its staging draft and the server does
 * not, and a routine import must not change last year's data without a
 * deliberate step.
 *
 * cost: as `applyYearStatus`.
 */
export const archiveYear = mutation({
	args: { year: v.string() },
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);
		if (!isValidSchoolYear(args.year)) {
			throw new Error('Year must be in YYYY-YYYY form');
		}
		return await applyYearStatus(ctx, { year: args.year, status: 'archived' });
	}
});

/**
 * Restore a whole school year.
 *
 * The symmetric counterpart, because an archive done in error has to be
 * recoverable without clicking through a hundred cohorts.
 *
 * cost: as `applyYearStatus`.
 */
export const restoreYear = mutation({
	args: { year: v.string() },
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);
		if (!isValidSchoolYear(args.year)) {
			throw new Error('Year must be in YYYY-YYYY form');
		}
		return await applyYearStatus(ctx, { year: args.year, status: 'active' });
	}
});
