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

/**
 * Creates one levelled cohort and returns `{ cohortId, classIds }`.
 *
 * Grades 7–9 get one `CLIL` class per levelled cohort (plus `Comm` for 7 and 8),
 * in the order `classTypesForCohort` names them.
 */
async function createCohort(
	t: ConvexTestInstance,
	options: { grade: number; level: string; classNumber?: string }
) {
	return t.mutation(api.esl.cohorts.create, {
		year: '2025-2026',
		grade: options.grade,
		level: options.level,
		classNumber: options.classNumber ?? '1'
	});
}

/**
 * A CLIL class's week: three distinct days.
 *
 * The same slots every mirror holds by construction (ADR-0028) — the point of
 * the rule is that re-leaving students between the band's cohorts never gains a
 * lesson, so the band must agree on the week.
 */
const THREE = [
	{ day: 'Monday' as const, period: 1 },
	{ day: 'Wednesday' as const, period: 2 },
	{ day: 'Friday' as const, period: 3 }
];

/** A Comm class's week: two distinct days. */
const TWO = [
	{ day: 'Tuesday' as const, period: 5 },
	{ day: 'Thursday' as const, period: 6 }
];

/** A week that skips Monday, for tests that need the source moved off it. */
const THREE_LATER = [
	{ day: 'Tuesday' as const, period: 1 },
	{ day: 'Wednesday' as const, period: 2 },
	{ day: 'Thursday' as const, period: 3 }
];

/**
 * Puts roster rows on a cohort, in the stored form (two digits, ADR-0025).
 *
 * The example band draws from four Chinese homerooms; every cohort that shares
 * that exact set is in the group, and anything else is not.
 */
async function seedRoster(
	t: ConvexTestInstance,
	cohortId: Id<'esl_cohorts'>,
	members: readonly { chineseClass?: string; status?: 'active' | 'disabled' }[]
) {
	for (const [index, member] of members.entries()) {
		await t.run(async (ctx) =>
			ctx.db.insert('esl_students', {
				cohortId,
				chineseName: `學生${index}`,
				schoolStudentId: `7002${String(index).padStart(3, '0')}`,
				status: member.status ?? 'active',
				enrolledAt: 1,
				...(member.chineseClass === undefined ? {} : { chineseClass: member.chineseClass })
			})
		);
	}
}

/** Writes meeting rows directly, for states the gate cannot produce. */
const seedMeeting = async (
	t: ConvexTestInstance,
	classId: Id<'esl_classes'>,
	year: string,
	day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday',
	period: number
) => t.run(async (ctx) => ctx.db.insert('esl_class_meetings', { classId, year, day, period }));

/** The meetings a class holds in a year, whatever wrote them. */
const meetingsOf = async (t: ConvexTestInstance, classId: Id<'esl_classes'>) => {
	const rows = await t.run(async (ctx) =>
		ctx.db
			.query('esl_class_meetings')
			.withIndex('by_classId', (q) => q.eq('classId', classId))
			.collect()
	);
	return rows
		.filter((row) => row.year === '2025-2026')
		.map((row) => ({ day: row.day, period: row.period }));
};

describe('esl schedule mirrors (ADR-0028)', () => {
	afterEach(() => vi.restoreAllMocks());

	/**
	 * The example band: every level of grade 7 draws the same four homerooms, so
	 * one save on the top level sets them all. Returns the source's classIds and
	 * every same-type class in the band.
	 */
	async function createSharedG7Band(t: ConvexTestInstance, options: { levels: string[] }) {
		const cohorts = [];
		for (const [index, level] of options.levels.entries()) {
			const cohort = await createCohort(t, { grade: 7, level, classNumber: String(index + 1) });
			await seedRoster(t, cohort.cohortId, [
				{ chineseClass: '02' },
				{ chineseClass: '04' },
				{ chineseClass: '05' },
				{ chineseClass: '08' }
			]);
			cohorts.push(cohort);
		}
		return cohorts;
	}

	describe('setSchedule', () => {
		it('mirrors the week onto every same-type class in the band', async () => {
			const t = await asEslAdmin();
			const [source, ...rest] = await createSharedG7Band(t, {
				levels: ['Advanced', 'Intermediate', 'Basic', 'Elementary']
			});

			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: source.classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			// One source, three mirrors written alongside it.
			expect(result.mirrors).toBe(3);
			for (const cohort of [source, ...rest]) {
				expect(await meetingsOf(t, cohort.classIds[0])).toEqual(THREE);
				// The cohort's Comm class is a different type: it keeps its own week,
				// however empty that is.
				expect(await meetingsOf(t, cohort.classIds[1])).toEqual([]);
			}
		});

		it('ignores a cohort that shares no Chinese homeroom', async () => {
			const t = await asEslAdmin();
			const source = await createCohort(t, { grade: 7, level: 'Advanced' });
			await seedRoster(t, source.cohortId, [{ chineseClass: '02' }, { chineseClass: '04' }]);
			const stranger = await createCohort(t, {
				grade: 7,
				level: 'Elementary',
				classNumber: '2'
			});
			await seedRoster(t, stranger.cohortId, [{ chineseClass: '05' }]);

			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: source.classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			expect(result.mirrors).toBeUndefined();
			expect(await meetingsOf(t, stranger.classIds[0])).toEqual([]);
		});

		it('treats an overlapping subset as a sibling in both directions', async () => {
			const t = await asEslAdmin();
			// G7 Advanced 3 draws J101/J106/J110; G7 Elementary 4 draws
			// J101/J106. They are one `跑班` band, not two.
			const advanced = await createCohort(t, { grade: 7, level: 'Advanced', classNumber: '3' });
			await seedRoster(t, advanced.cohortId, [
				{ chineseClass: '01' },
				{ chineseClass: '06' },
				{ chineseClass: '10' }
			]);
			const elementary = await createCohort(t, {
				grade: 7,
				level: 'Elementary',
				classNumber: '4'
			});
			await seedRoster(t, elementary.cohortId, [{ chineseClass: '01' }, { chineseClass: '06' }]);

			// The larger roster writes the smaller one.
			let result = await t.mutation(api.esl.classes.setSchedule, {
				classId: advanced.classIds[0],
				year: '2025-2026',
				meetings: THREE
			});
			expect(result.mirrors).toBe(1);
			expect(await meetingsOf(t, elementary.classIds[0])).toEqual(THREE);

			// And the smaller writes the larger: the relation is symmetric.
			result = await t.mutation(api.esl.classes.setSchedule, {
				classId: elementary.classIds[0],
				year: '2025-2026',
				meetings: THREE_LATER
			});
			expect(result.mirrors).toBe(1);
			expect(await meetingsOf(t, advanced.classIds[0])).toEqual(THREE_LATER);
		});

		it('walks a transitive chain of overlapping rosters', async () => {
			const t = await asEslAdmin();
			const a = await createCohort(t, { grade: 7, level: 'Advanced', classNumber: '1' });
			await seedRoster(t, a.cohortId, [{ chineseClass: '01' }, { chineseClass: '02' }]);
			const b = await createCohort(t, { grade: 7, level: 'Intermediate', classNumber: '2' });
			await seedRoster(t, b.cohortId, [{ chineseClass: '02' }, { chineseClass: '03' }]);
			const c = await createCohort(t, { grade: 7, level: 'Elementary', classNumber: '3' });
			await seedRoster(t, c.cohortId, [{ chineseClass: '03' }, { chineseClass: '04' }]);

			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: a.classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			expect(result.mirrors).toBe(2);
			expect(await meetingsOf(t, b.classIds[0])).toEqual(THREE);
			expect(await meetingsOf(t, c.classIds[0])).toEqual(THREE);
		});

		it('keeps disjoint `跑班` bands in the same grade separate', async () => {
			const t = await asEslAdmin();
			const bandOne = await createCohort(t, { grade: 7, level: 'Advanced', classNumber: '1' });
			await seedRoster(t, bandOne.cohortId, [
				{ chineseClass: '02' },
				{ chineseClass: '04' },
				{ chineseClass: '05' },
				{ chineseClass: '08' }
			]);
			const bandTwo = await createCohort(t, { grade: 7, level: 'Elementary', classNumber: '2' });
			await seedRoster(t, bandTwo.cohortId, [
				{ chineseClass: '03' },
				{ chineseClass: '07' },
				{ chineseClass: '09' }
			]);

			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: bandOne.classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			expect(result.mirrors).toBeUndefined();
			expect(await meetingsOf(t, bandTwo.classIds[0])).toEqual([]);
		});

		it('ignores archived classes and archived cohorts', async () => {
			const t = await asEslAdmin();
			const source = await createCohort(t, { grade: 7, level: 'Advanced' });
			await seedRoster(t, source.cohortId, [{ chineseClass: '02' }]);
			const archivedClass = await createCohort(t, {
				grade: 7,
				level: 'Elementary',
				classNumber: '2'
			});
			await seedRoster(t, archivedClass.cohortId, [{ chineseClass: '02' }]);
			const archivedCohort = await createCohort(t, {
				grade: 7,
				level: 'Basic',
				classNumber: '3'
			});
			await seedRoster(t, archivedCohort.cohortId, [{ chineseClass: '02' }]);
			await t.mutation(api.esl.classes.setStatus, {
				id: archivedClass.classIds[0],
				status: 'archived'
			});
			await t.run((ctx) => ctx.db.patch(archivedCohort.cohortId, { status: 'archived' as const }));

			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: source.classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			expect(result.mirrors).toBeUndefined();
			expect(await meetingsOf(t, archivedClass.classIds[0])).toEqual([]);
			expect(await meetingsOf(t, archivedCohort.classIds[0])).toEqual([]);
		});

		it('ignores a cohort with no active roster', async () => {
			const t = await asEslAdmin();
			const source = await createCohort(t, { grade: 7, level: 'Advanced' });
			await seedRoster(t, source.cohortId, [{ chineseClass: '02' }]);
			// A cohort that exists but whose import has not landed yet.
			const empty = await createCohort(t, { grade: 7, level: 'Elementary', classNumber: '2' });

			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: source.classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			// No composition to match on, so no mirror — but the save itself is
			// an ordinary one-class write.
			expect(result.mirrors).toBeUndefined();
			expect(await meetingsOf(t, empty.classIds[0])).toEqual([]);
			expect(await meetingsOf(t, source.classIds[0])).toEqual(THREE);
		});

		it('mirrors Comm saves onto Comm classes, leaving CLIL classes alone', async () => {
			const t = await asEslAdmin();
			const [source, ...rest] = await createSharedG7Band(t, {
				levels: ['Advanced', 'Basic', 'Elementary']
			});

			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: source.classIds[1],
				year: '2025-2026',
				meetings: TWO
			});

			expect(result.mirrors).toBe(2);
			for (const cohort of [source, ...rest]) {
				expect(await meetingsOf(t, cohort.classIds[1])).toEqual(TWO);
				expect(await meetingsOf(t, cohort.classIds[0])).toEqual([]);
			}
		});

		it('mirrors a G9 class onto the same-type G9 cohorts', async () => {
			const t = await asEslAdmin();
			const source = await createCohort(t, { grade: 9, level: 'Intermediate' });
			await seedRoster(t, source.cohortId, [{ chineseClass: '02' }]);
			const mirror = await createCohort(t, { grade: 9, level: 'Elementary', classNumber: '2' });
			await seedRoster(t, mirror.cohortId, [{ chineseClass: '02' }]);

			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: source.classIds[0],
				year: '2025-2026',
				meetings: TWO
			});

			expect(result.mirrors).toBe(1);
			expect(await meetingsOf(t, mirror.classIds[0])).toEqual(TWO);
		});

		it('is symmetric: any member of the band triggers the whole band', async () => {
			const t = await asEslAdmin();
			const cohorts = await createSharedG7Band(t, {
				levels: ['Advanced', 'Elementary', 'Pre-Elementary']
			});

			// The *lowest* level saves first. The group is a fact about the
			// cohorts, not an ordering: writing from either end reaches the rest.
			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: cohorts[2].classIds[0],
				year: '2025-2026',
				meetings: THREE_LATER
			});

			expect(result.mirrors).toBe(2);
			for (const cohort of cohorts) {
				expect(await meetingsOf(t, cohort.classIds[0])).toEqual(THREE_LATER);
			}
		});

		it('skips the group when the week is unchanged, as a room-only save is', async () => {
			const t = await asEslAdmin();
			const source = await createCohort(t, { grade: 7, level: 'Advanced' });
			await seedRoster(t, source.cohortId, [{ chineseClass: '02' }]);
			// The week is already saved, in the shuffled order a re-read can
			// produce it in — only the set decides.
			await seedMeeting(t, source.classIds[0], '2025-2026', 'Friday', 3);
			await seedMeeting(t, source.classIds[0], '2025-2026', 'Monday', 1);
			await seedMeeting(t, source.classIds[0], '2025-2026', 'Wednesday', 2);
			const mirror = await createCohort(t, { grade: 7, level: 'Elementary', classNumber: '2' });
			await seedRoster(t, mirror.cohortId, [{ chineseClass: '02' }]);

			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: source.classIds[0],
				year: '2025-2026',
				meetings: THREE,
				// The room: the thing the setup flow actually changed.
				room: 'ESL B'
			});

			// Not a mirror write — and the room still lands.
			expect(result.mirrors).toBeUndefined();
			expect(await meetingsOf(t, mirror.classIds[0])).toEqual([]);
			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const saved = rows.find(
				(row: { classId: Id<'esl_classes'>; room: string | null }) =>
					row.classId === source.classIds[0]
			);
			expect(saved).toMatchObject({ room: 'ESL B' });
		});
	});

	describe('refusals', () => {
		it('refuses the whole write when one mirror breaks a cohort rule', async () => {
			const t = await asEslAdmin();
			const cohorts = await createSharedG7Band(t, {
				levels: ['Advanced', 'Basic', 'Elementary']
			});
			// The Basic cohort's Comm class already holds Monday P1, so its CLIL
			// cohort-slot rule refuses that slot.
			await seedMeeting(t, cohorts[1].classIds[1], '2025-2026', 'Monday', 1);

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: cohorts[0].classIds[0],
					year: '2025-2026',
					meetings: THREE
				})
			).rejects.toThrow(/G7 Basic 2 CLIL: G7 Basic 2 Comm draws the same students/);

			// Atomic: nothing moved, not even the class that passed its own gate.
			expect(await meetingsOf(t, cohorts[0].classIds[0])).toEqual([]);
			expect(await meetingsOf(t, cohorts[2].classIds[0])).toEqual([]);
		});

		it('refuses when two group members share a teacher', async () => {
			const t = await asEslAdmin();
			const cohorts = await createSharedG7Band(t, { levels: ['Advanced', 'Basic'] });
			const teacherId = await seedEslStaff(t, {
				authId: 'esl-teacher',
				eslRole: 'teacher',
				signIn: false
			});
			for (const cohort of cohorts) {
				await t.mutation(api.esl.classes.assignTeacher, {
					id: cohort.classIds[0],
					teacherId
				});
			}

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: cohorts[0].classIds[0],
					year: '2025-2026',
					meetings: THREE
				})
			).rejects.toThrow(/have the same teacher/);

			expect(await meetingsOf(t, cohorts[1].classIds[0])).toEqual([]);
		});

		it('refuses when two group members share a room', async () => {
			const t = await asEslAdmin();
			const cohorts = await createSharedG7Band(t, { levels: ['Advanced', 'Basic'] });
			for (const cohort of cohorts) {
				await t.run((ctx) => ctx.db.patch(cohort.classIds[0], { room: 'ESL A' as const }));
			}

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: cohorts[0].classIds[0],
					year: '2025-2026',
					meetings: THREE
				})
			).rejects.toThrow(/both meet in ESL A/);

			expect(await meetingsOf(t, cohorts[1].classIds[0])).toEqual([]);
		});

		it('lets a mirrored save proceed when rooms and teachers differ', async () => {
			const t = await asEslAdmin();
			const cohorts = await createSharedG7Band(t, { levels: ['Advanced', 'Basic'] });
			for (const [index, cohort] of cohorts.entries()) {
				const room = `ESL ${String.fromCharCode(65 + index)}`;
				await t.run((ctx) => ctx.db.patch(cohort.classIds[0], { room }));
			}

			const result = await t.mutation(api.esl.classes.setSchedule, {
				classId: cohorts[0].classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			expect(result.mirrors).toBe(1);
			expect(await meetingsOf(t, cohorts[1].classIds[0])).toEqual(THREE);
		});
	});

	describe('listScheduleMirrors', () => {
		it('resolves empty for a cohort with nothing to mirror', async () => {
			const t = await asEslAdmin();
			const source = await createCohort(t, { grade: 7, level: 'Advanced' });

			const result = await t.query(api.esl.classes.listScheduleMirrors, {
				classId: source.classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			expect(result.targets).toEqual([]);
		});

		it('reports each target with overwrite state and predicted problems', async () => {
			const t = await asEslAdmin();
			const cohorts = await createSharedG7Band(t, {
				levels: ['Advanced', 'Basic', 'Elementary']
			});
			// Basic already has a week this save would overwrite.
			for (const meeting of THREE) {
				await seedMeeting(t, cohorts[1].classIds[0], '2025-2026', meeting.day, meeting.period);
			}
			// Elementary's Comm holds Wednesday P2, where the Elementary CLIL's
			// cohort-slot rule fires against THREE's Wednesday pick.
			await seedMeeting(t, cohorts[2].classIds[1], '2025-2026', 'Wednesday', 2);

			const result = await t.query(api.esl.classes.listScheduleMirrors, {
				classId: cohorts[0].classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			const byName = new Map(
				result.targets.map(
					(target: { name: string; willOverwrite: boolean; problems: unknown[] }) => [
						target.name,
						target
					]
				)
			);
			expect(byName.get('G7 Basic 2 CLIL')?.willOverwrite).toBe(true);
			expect(byName.get('G7 Elementary 3 CLIL')?.willOverwrite).toBe(false);
			expect(byName.get('G7 Elementary 3 CLIL')?.problems).toHaveLength(1);
			expect(byName.get('G7 Basic 2 CLIL')?.problems).toEqual([]);
			// The source's own cohort's Comm holds no week, so it surfaces in no
			// target — the targets are the *other* classes in the group.
			expect(result.targets).toHaveLength(2);
		});

		it('judges a drafted room against the save, not the stale saved one', async () => {
			const t = await asEslAdmin();
			const cohorts = await createSharedG7Band(t, { levels: ['Advanced', 'Basic'] });
			for (const cohort of cohorts) {
				await t.run((ctx) => ctx.db.patch(cohort.classIds[0], { room: 'ESL A' as const }));
			}

			// Both classes sit in ESL A today: a save that keeps it is refused,
			// and one that drafts a different room is clean.
			const asIs = await t.query(api.esl.classes.listScheduleMirrors, {
				classId: cohorts[0].classIds[0],
				year: '2025-2026',
				meetings: THREE
			});
			expect(asIs.targets).toHaveLength(1);
			const asIsProblemKinds = asIs.targets.map((target: { problems: { kind: string }[] }) =>
				target.problems.map((problem) => problem.kind)
			);
			expect(asIsProblemKinds.flat()).toContain('room');

			const moved = await t.query(api.esl.classes.listScheduleMirrors, {
				classId: cohorts[0].classIds[0],
				year: '2025-2026',
				meetings: THREE,
				room: 'ESL B'
			});
			const movedProblems = moved.targets.map((target: { problems: unknown[] }) => target.problems);
			expect(movedProblems.flat()).toEqual([]);
		});

		it('resolves empty when the proposed week is the one already saved', async () => {
			const t = await asEslAdmin();
			const cohorts = await createSharedG7Band(t, { levels: ['Advanced', 'Basic'] });
			// The band is already on THREE — a normal week save put it there.
			for (const cohort of cohorts) {
				for (const meeting of THREE) {
					await seedMeeting(t, cohort.classIds[0], '2025-2026', meeting.day, meeting.period);
				}
			}

			// The save the setup flow produces while setting rooms class by class:
			// the picker re-seeds the saved week, the admin changes only the room.
			// Whatever the group state, this save touches one class, so there is
			// nothing to confirm.
			const result = await t.query(api.esl.classes.listScheduleMirrors, {
				classId: cohorts[0].classIds[0],
				year: '2025-2026',
				meetings: THREE,
				room: 'ESL B'
			});

			expect(result.targets).toEqual([]);
		});
	});
});
