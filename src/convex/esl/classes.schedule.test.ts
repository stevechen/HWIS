import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	convexTest,
	modules,
	mockAuthUser,
	seedEslStaff,
	seedUser,
	type ConvexTestInstance
} from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';

async function asEslAdmin(authId = 'esl-admin') {
	const t = convexTest(schema, modules);
	await seedEslStaff(t, { authId, eslRole: 'admin' });
	return t;
}

/** Creates a G7 cohort and returns `{ cohortId, classIds }` (CLIL first, then Comm). */
async function createG7(t: ConvexTestInstance, classNumber = '1') {
	return t.mutation(api.esl.cohorts.create, {
		year: '2025-2026',
		grade: 7,
		level: 'Basic',
		classNumber
	});
}

/** A CLIL class's week: three distinct days. */
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

/**
 * Creates both sections of a grade 10 Chinese class.
 *
 * `cohorts.create` composes one cohort per level, so Chinese class 01 at levels A
 * and B is two calls. Their `A`/`B` pairing is the schedule invariant under test
 * (ADR-0023 rule 7), which is why they are made together rather than separately.
 */
async function createG10Pair(t: ConvexTestInstance, classNumber = '01') {
	const sectionA = await t.mutation(api.esl.cohorts.create, {
		year: '2025-2026',
		grade: 10,
		level: 'A',
		classNumber
	});
	const sectionB = await t.mutation(api.esl.cohorts.create, {
		year: '2025-2026',
		grade: 10,
		level: 'B',
		classNumber
	});
	return { classA: sectionA.classIds[0], classB: sectionB.classIds[0] };
}

/**
 * A row as the schedule query returns it.
 *
 * Named so a callback over the result can be annotated: `t.query` hands back an
 * untyped array in this suite, which under `noImplicitAny` makes every arrow
 * parameter an error — and annotating with a structural type keeps the test free
 * of a cast.
 */
type ScheduleRow = {
	classId: Id<'esl_classes'>;
	meetings: { day: string; period: number }[];
	/**
	 * Every rule the department runs: the chips and the card marker.
	 *
	 * Required, not optional: the read always returns it now, for retired rows too
	 * (as an empty list). It was optional while the read also carried a separate
	 * `conflicts` list, and the two could disagree.
	 */
	problems: { kind: string; day?: string; period?: number }[];
	/** True when the class or its cohort is archived. */
	archived?: boolean;
	scheduleProblem?: unknown;
	scheduleLabel?: string | null;
};

const meetingsOf = async (t: ConvexTestInstance, classId: Id<'esl_classes'>) =>
	t.run(async (ctx) =>
		ctx.db
			.query('esl_class_meetings')
			.withIndex('by_classId', (q) => q.eq('classId', classId))
			.collect()
	);

/**
 * Writes a meeting row directly, for states no mutation can produce.
 *
 * The year is the point: no UI path schedules a class into a year other than its
 * cohort's, so this is the only way to exercise the year filter (see the cross-year
 * test below).
 */
const seedMeeting = async (
	t: ConvexTestInstance,
	classId: Id<'esl_classes'>,
	year: string,
	day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday',
	period: number
) =>
	t.run(async (ctx) =>
		ctx.db.insert('esl_class_meetings', {
			classId,
			year,
			day,
			period
		})
	);

/**
 * Writes a whole week of meeting rows directly.
 *
 * For states the write gate now refuses to create — a clash already sitting in the
 * data from before the gate, a restore, an import. The read has to keep reporting
 * those, and it can only be tested by putting them there.
 */
const seedWeek = async (
	t: ConvexTestInstance,
	classId: Id<'esl_classes'>,
	year: string,
	meetings: readonly {
		day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
		period: number;
	}[]
) => {
	for (const meeting of meetings) {
		await seedMeeting(t, classId, year, meeting.day, meeting.period);
	}
};

describe('esl class schedules', () => {
	afterEach(() => vi.restoreAllMocks());

	describe('setSchedule', () => {
		it('stores exactly the meetings it was given', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			const rows = await meetingsOf(t, classIds[0]);
			expect(rows).toHaveLength(3);
			expect(rows[0]).toMatchObject({ year: '2025-2026', day: 'Monday', period: 1 });
		});

		it('replaces the previous week rather than adding to it', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: THREE
			});
			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: [
					{ day: 'Monday', period: 7 },
					{ day: 'Tuesday', period: 8 },
					{ day: 'Friday', period: 4 }
				]
			});

			const rows = await meetingsOf(t, classIds[0]);
			expect(rows).toHaveLength(3);
			expect(rows.map((r) => r.period).sort()).toEqual([4, 7, 8]);
		});

		// Absence is a legitimate state, not a malformed one: a newly
		// imported year starts unscheduled (ADR-0027).
		it('accepts clearing the schedule entirely', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: THREE
			});
			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: []
			});

			expect(await meetingsOf(t, classIds[0])).toHaveLength(0);
		});

		it('rejects the wrong number of meetings for the type', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2025-2026',
					meetings: TWO
				})
			).rejects.toThrow('must meet 3 periods a week');
		});

		it('rejects two meetings on the same day', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2025-2026',
					meetings: [
						{ day: 'Monday', period: 1 },
						{ day: 'Monday', period: 2 },
						{ day: 'Friday', period: 3 }
					]
				})
			).rejects.toThrow('at most one ESL period');
		});

		it('rejects a period the school does not run', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2025-2026',
					meetings: [
						{ day: 'Monday', period: 1 },
						{ day: 'Wednesday', period: 9 },
						{ day: 'Friday', period: 3 }
					]
				})
			).rejects.toThrow("Period 9 is not one of the school's periods");
		});

		// A clash the gate now refuses to *create*, but which the read must still
		// report: data written before the gate existed, restored from a backup, or
		// put there by a path the gate does not cover. The read is the safety net
		// for exactly that, so it is seeded directly rather than through a mutation
		// that would now (correctly) refuse.
		it('reports a cohort clash already in the data, on both classes', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await seedWeek(t, classIds[1], '2025-2026', TWO);
			await seedWeek(t, classIds[0], '2025-2026', [
				{ day: TWO[0].day, period: TWO[0].period },
				{ day: 'Wednesday', period: 4 },
				{ day: 'Friday', period: 3 }
			]);

			// Both classes are flagged. The clash is symmetrical: either one could
			// be the one that moves, so reporting it on one side alone would leave
			// the other looking fine.
			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			for (const row of rows) {
				if (!classIds.some((id) => id === row.classId)) continue;
				expect(row.problems).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							kind: 'cohort-slot',
							day: TWO[0].day,
							period: TWO[0].period
						})
					])
				);
			}
		});

		// Two classes of *different* cohorts in the same slot clash only if they
		// share a room or a teacher, so with neither assigned there is nothing to
		// refuse.
		it('allows the same slot for classes sharing neither room nor teacher', async () => {
			const t = await asEslAdmin();
			const first = await createG7(t, '1');
			const second = await createG7(t, '2');

			await t.mutation(api.esl.classes.setSchedule, {
				classId: second.classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: first.classIds[0],
					year: '2025-2026',
					meetings: THREE
				})
			).resolves.toMatchObject({ success: true });
		});

		it('moves a grade 10 pair together, never one section at a time', async () => {
			// ADR-0023 rule 7 used to be a *check*: save one section, and a mismatch
			// against the other's saved week refused the write. Now the pair is written
			// as a unit, so a disagreement cannot be expressed at all — saving from
			// either card moves both. This pins the stronger guarantee.
			const t = await asEslAdmin();
			const { classA, classB } = await createG10Pair(t);
			await t.mutation(api.esl.classes.setRoom, { classId: classA, room: 'ESL A' });
			await t.mutation(api.esl.classes.setRoom, { classId: classB, room: 'ESL B' });
			await t.mutation(api.esl.classes.setSchedule, {
				classId: classB,
				year: '2025-2026',
				meetings: TWO
			});
			// Deliberately different slots from `TWO`. Under the old rule this was
			// refused as a mismatch; now it is simply the pair's new week, on both.
			const later = [
				{ day: 'Tuesday' as const, period: 5 },
				{ day: 'Thursday' as const, period: 7 }
			];
			await t.mutation(api.esl.classes.setSchedule, {
				classId: classA,
				year: '2025-2026',
				meetings: later
			});
			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const a = rows.find((row: ScheduleRow) => row.classId === classA);
			const b = rows.find((row: ScheduleRow) => row.classId === classB);
			expect(a?.meetings).toEqual(later);
			expect(b?.meetings).toEqual(later);
		});

		it('accepts a grade 10 pair whose sections meet at the same slots', async () => {
			// The rule's normal case: identical weeks, so the write goes through.
			const t = await asEslAdmin();
			const { classA, classB } = await createG10Pair(t);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classB,
				year: '2025-2026',
				meetings: TWO
			});

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classA,
					year: '2025-2026',
					meetings: TWO
				})
			).resolves.toMatchObject({ success: true });
		});

		it('lets a grade 10 section be scheduled before its partner exists', async () => {
			// Scheduling one section of a fresh year is the normal first step. Refusing it
			// would block the year's first write for no gain.
			const t = await asEslAdmin();
			const { classA } = await createG10Pair(t);

			// Remove the partner cohort, leaving `H101A` with nothing to be in step with.
			await t.run(async (ctx) => {
				const cohorts = await ctx.db.query('esl_cohorts').collect();
				for (const cohort of cohorts) {
					if (cohort.grade === 10 && cohort.level === 'B') await ctx.db.delete(cohort._id);
				}
			});

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classA,
					year: '2025-2026',
					meetings: TWO
				})
			).resolves.toMatchObject({ success: true });
		});

		/**
		 * The user's scenario, end to end: one teacher, two classes, the same slot, and
		 * **different** rooms.
		 *
		 * Distinct rooms is what makes this a *teacher* clash rather than a room one — and
		 * the case worth pinning, because a teacher double-booking across two rooms is the
		 * mistake nobody sees: each card's room looks perfectly fine, and only the person
		 * is in two places.
		 */
		it('reports a teacher in two different rooms at the same slot', async () => {
			const t = await asEslAdmin();
			const teacherId = await seedUser(t, { authId: 'teacher_two_rooms' });
			const first = await createG7(t, '1');
			const second = await createG7(t, '2');

			for (const classId of [first.classIds[0], second.classIds[0]]) {
				await t.mutation(api.esl.classes.assignTeacher, { id: classId, teacherId });
			}

			// Same slot for both, so the two overlap on Monday P1. Seeded rather than
			// saved: the gate refuses to *create* this clash, which is the point, so
			// the only way to test that the read reports one is to put one there.
			await seedWeek(t, first.classIds[0], '2025-2026', THREE);
			await seedWeek(t, second.classIds[0], '2025-2026', THREE);

			// The rooms deliberately differ, so only the teacher is duplicated.
			await t.mutation(api.esl.classes.setRoom, { classId: first.classIds[0], room: 'ESL A' });
			await t.mutation(api.esl.classes.setRoom, { classId: second.classIds[0], room: 'ESL B' });

			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });

			for (const classId of [first.classIds[0], second.classIds[0]]) {
				const row = rows.find((candidate: ScheduleRow) => candidate.classId === classId);
				expect(row?.problems).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ kind: 'teacher', day: 'Monday', period: 1 })
					])
				);
				// And not mistaken for a room clash: the rooms are different.
				expect(row?.problems).not.toEqual(
					expect.arrayContaining([expect.objectContaining({ kind: 'room' })])
				);
			}
		});

		/**
		 * `esl_class_meetings` rows carry their own `year`, and both the read and the
		 * delete now respect it.
		 *
		 * Not a live bug in the UI: a class's meetings always carry its cohort's year,
		 * because the page passes the year it filtered by. The filter guards what the UI
		 * cannot produce today - a caller passing a mismatched year, or a restore
		 * importing another year's rows - and makes the invariant explicit rather than
		 * incidental.
		 */
		it('keeps one year’s schedule from leaking into another', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await seedMeeting(t, classIds[0], '2099-2100', 'Tuesday', 8);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			// The read ignores the other year's row.
			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const row = rows.find((candidate: ScheduleRow) => candidate.classId === classIds[0]);
			expect(row?.meetings).toHaveLength(3);
			expect(row?.meetings.map((meeting: { period: number }) => meeting.period)).not.toContain(8);

			// And the save did not delete it.
			const stored = await meetingsOf(t, classIds[0]);
			expect(stored.filter((meeting) => meeting.year === '2099-2100')).toHaveLength(1);
			expect(stored.filter((meeting) => meeting.year === '2025-2026')).toHaveLength(3);
		});

		it('lets a class re-save its own unchanged schedule', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2025-2026',
					meetings: THREE
				})
			).resolves.toMatchObject({ success: true });
		});

		it('does not confuse last year with this year', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[1],
				year: '2025-2026',
				meetings: TWO
			});

			// The same weekday and period in a *different* year is not a
			// clash — which is why `year` is stored on the meeting.
			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2026-2027',
					meetings: [
						{ day: 'Tuesday', period: 5 },
						{ day: 'Wednesday', period: 4 },
						{ day: 'Friday', period: 3 }
					]
				})
			).resolves.toMatchObject({ success: true });
		});

		it('refuses a write from a caller who is not an ESL admin', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);
			mockAuthUser(null);

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2025-2026',
					meetings: THREE
				})
			).rejects.toThrow('Unauthorized');
		});
	});

	describe('setRoom', () => {
		it('sets a room', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setRoom, {
				classId: classIds[0],
				room: 'ESL A'
			});

			const row = await t.run(async (ctx) => ctx.db.get(classIds[0]));
			expect(row?.room).toBe('ESL A');
		});

		// The school adding a room next year is not a data error, so no
		// name is rejected — see ADR-0027.
		it('accepts a room it has never heard of', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await expect(
				t.mutation(api.esl.classes.setRoom, {
					classId: classIds[0],
					room: 'Language Lab 2'
				})
			).resolves.toMatchObject({ room: 'Language Lab 2' });
		});

		it('clears the room', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setRoom, {
				classId: classIds[0],
				room: 'ESL A'
			});
			await t.mutation(api.esl.classes.setRoom, { classId: classIds[0] });

			const row = await t.run(async (ctx) => ctx.db.get(classIds[0]));
			expect(row?.room).toBeUndefined();
		});

		it('refuses a write from a caller who is not an ESL admin', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);
			mockAuthUser(null);

			await expect(
				t.mutation(api.esl.classes.setRoom, {
					classId: classIds[0],
					room: 'ESL A'
				})
			).rejects.toThrow('Unauthorized');
		});
	});

	describe('the write gate', () => {
		/**
		 * Two G7 classes in *different* cohorts, both in one room, both in one slot.
		 *
		 * Not the two sections of one cohort: those are barred from sharing a slot by
		 * the same rule under test, so a fixture built from them proves nothing. A
		 * shared room across two cohorts is the ordinary clash.
		 */
		const roomClash = async (t: ConvexTestInstance) => {
			const first = (await createG7(t, '1')).classIds[0];
			const second = (await createG7(t, '2')).classIds[0];
			await t.mutation(api.esl.classes.setRoom, { classId: first, room: 'ESL A' });
			await t.mutation(api.esl.classes.setRoom, { classId: second, room: 'ESL A' });
			await t.mutation(api.esl.classes.setSchedule, {
				classId: second,
				year: '2025-2026',
				meetings: THREE
			});
			return { first, second };
		};

		it('refuses a room double-booking, naming the other class', async () => {
			const t = await asEslAdmin();
			const { first } = await roomClash(t);

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: first,
					year: '2025-2026',
					meetings: THREE
				})
			).rejects.toThrow(/ESL A is taken by .*CLIL/);
		});

		it('allows the same slots once the rooms differ', async () => {
			// The control for the test above: the same two classes, the same week, the
			// same slots — so what changed is the room, not the fixture.
			const t = await asEslAdmin();
			const { first } = await roomClash(t);
			await t.mutation(api.esl.classes.setRoom, { classId: first, room: 'ESL B' });

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: first,
					year: '2025-2026',
					meetings: THREE
				})
			).resolves.toMatchObject({ success: true });
		});

		it('names every reason at once, not just the first', async () => {
			// A class clashing in three slots has three things to fix. Reporting one
			// per press would make this a three-press loop that only reveals the
			// next problem each time.
			const t = await asEslAdmin();
			const { first } = await roomClash(t);

			const error = await t
				.mutation(api.esl.classes.setSchedule, {
					classId: first,
					year: '2025-2026',
					meetings: THREE
				})
				.then(
					() => null,
					(thrown: unknown) => thrown
				);

			expect(String(error)).toContain('This schedule cannot be saved:');
			// One line per clashing meeting, not one line for the class.
			expect(String(error).split('•').length - 1).toBe(THREE.length);
		});

		it('refuses a cohort overlap', async () => {
			// The rule that was advisory until this gate: a roster drawn into two
			// rooms at once. The sibling runs first, then the CLIL class is asked to
			// take one of its slots.
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[1],
				year: '2025-2026',
				meetings: TWO
			});

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2025-2026',
					meetings: [
						{ day: TWO[0].day, period: TWO[0].period },
						{ day: 'Wednesday', period: 4 },
						{ day: 'Friday', period: 3 }
					]
				})
			).rejects.toThrow(/draws the same students/);
		});

		it('refuses a slot the teacher is marked unavailable for', async () => {
			// Availability has no UI yet — nothing writes these rows — so this is
			// currently the only path the rule can be reached by, and the only way to
			// prove the year filter is right.
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);
			const teacher = await seedUser(t, { authId: 'ms-rao', name: 'Ms Rao' });

			await t.run((ctx) =>
				ctx.db.insert('esl_teacher_availability', {
					teacherId: teacher,
					year: '2024-2025',
					day: 'Monday',
					period: 1
				})
			);
			await t.mutation(api.esl.classes.assignTeacher, { id: classIds[0], teacherId: teacher });

			// Last year's block does not apply to this year's Monday P1.
			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2025-2026',
					meetings: THREE
				})
			).resolves.toMatchObject({ success: true });
		});

		it("refuses this year's own block, quoting the note", async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);
			const teacher = await seedUser(t, { authId: 'ms-rao', name: 'Ms Rao' });

			await t.run((ctx) =>
				ctx.db.insert('esl_teacher_availability', {
					teacherId: teacher,
					year: '2025-2026',
					day: 'Monday',
					period: 1,
					note: 'lunch duty'
				})
			);
			await t.mutation(api.esl.classes.assignTeacher, { id: classIds[0], teacherId: teacher });

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2025-2026',
					meetings: THREE
				})
			).rejects.toThrow(/lunch duty/);
		});

		it('does not judge a class against its own saved rows', async () => {
			// Re-saving an unchanged week must be a no-op, not a self-clash. Without
			// the self-exclusion every re-save would fail once a class had any
			// schedule at all, and nothing could ever be edited.
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2025-2026',
					meetings: THREE
				})
			).resolves.toMatchObject({ success: true });
		});

		it('lets an archived class be rescheduled', async () => {
			// The archived-neighbour guard, at the write. A retired class must not be
			// able to block a live one, or archiving would be worse than useless.
			// The sibling is archived *on exactly the slots* the live class is about
			// to take, so the test fails if the guard is not doing its job.
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);
			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[1],
				year: '2025-2026',
				meetings: [
					{ day: THREE[0].day, period: THREE[0].period },
					{ day: THREE[1].day, period: THREE[1].period }
				]
			});
			await t.mutation(api.esl.classes.setStatus, { id: classIds[1], status: 'archived' });

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classIds[0],
					year: '2025-2026',
					meetings: THREE
				})
			).resolves.toMatchObject({ success: true });
		});
	});

	describe('the grade 10 pair', () => {
		/**
		 * The test that matters: a refused pair save must leave *neither* section
		 * written.
		 *
		 * Two independent mutations could not promise this — the first would land and
		 * the second would fail, leaving `H101A` on the new week and `H101B` on the
		 * old. That split is unrepairable, because either repair is itself a gated
		 * write. The fix is one transaction, and this is what proves it.
		 */
		it('writes both sections or neither', async () => {
			const t = await asEslAdmin();
			const { classA, classB } = await createG10Pair(t);
			await t.mutation(api.esl.classes.setRoom, { classId: classA, room: 'ESL A' });
			await t.mutation(api.esl.classes.setRoom, { classId: classB, room: 'ESL B' });
			// Saving either section writes the pair, so this is the pair's settled week.
			await t.mutation(api.esl.classes.setSchedule, {
				classId: classB,
				year: '2025-2026',
				meetings: TWO
			});

			// A class of another cohort holds `ESL A` on Monday and Tuesday, so a move
			// onto those slots is refused by the ordinary room rule. Seeded directly,
			// because the gate correctly refuses to create the clash.
			const moved = [
				{ day: 'Monday' as const, period: 1 },
				{ day: 'Tuesday' as const, period: 2 }
			];
			const other = (await createG7(t, '1')).classIds[0];
			await t.run((ctx) => ctx.db.patch(other, { room: 'ESL A' }));
			await seedWeek(t, other, '2025-2026', moved);

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classA,
					year: '2025-2026',
					meetings: moved
				})
			).rejects.toThrow(/ESL A is taken by/);

			// Neither section moved. Two independent mutations would have written
			// classA's new week before classB's save failed, leaving the pair split on
			// a day the gate then refuses to repair.
			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const a = rows.find((row: ScheduleRow) => row.classId === classA);
			const b = rows.find((row: ScheduleRow) => row.classId === classB);
			expect(a?.meetings).toEqual(TWO);
			expect(b?.meetings).toEqual(TWO);
		});

		it('saves one week to both sections from either card', async () => {
			const t = await asEslAdmin();
			const { classA, classB } = await createG10Pair(t);
			await t.mutation(api.esl.classes.setRoom, { classId: classA, room: 'ESL A' });
			await t.mutation(api.esl.classes.setRoom, { classId: classB, room: 'ESL B' });

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classA,
				year: '2025-2026',
				meetings: TWO
			});

			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const a = rows.find((row: ScheduleRow) => row.classId === classA);
			const b = rows.find((row: ScheduleRow) => row.classId === classB);
			expect(a?.meetings).toEqual(TWO);
			expect(b?.meetings).toEqual(TWO);
		});

		it('refuses when the two sections are given the same room', async () => {
			// The pair's own rule, with its own sentence. Left to the general gate it
			// would read "ESL A is taken by H101B", which is true but tells the
			// coordinator nothing about what a pair is supposed to look like.
			const t = await asEslAdmin();
			const { classA, classB } = await createG10Pair(t);
			await t.mutation(api.esl.classes.setRoom, { classId: classA, room: 'ESL A' });
			await t.mutation(api.esl.classes.setRoom, { classId: classB, room: 'ESL A' });

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classA,
					year: '2025-2026',
					meetings: TWO
				})
			).rejects.toThrow(/need different rooms/);
			expect(classB).toBeDefined();
		});

		it('refuses when the two sections are given the same teacher', async () => {
			const t = await asEslAdmin();
			const { classA, classB } = await createG10Pair(t);
			const teacher = await seedUser(t, { authId: 'ms-rao', name: 'Ms Rao' });

			await t.mutation(api.esl.classes.assignTeacher, { id: classA, teacherId: teacher });
			// Set directly: `assignTeacher` cannot tell the pair apart, and the point
			// of this test is the schedule write refusing a pair that already shares
			// a teacher.
			await t.run((ctx) => ctx.db.patch(classB, { teacherId: teacher }));

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classA,
					year: '2025-2026',
					meetings: TWO
				})
			).rejects.toThrow(/need different ones/);
		});

		it('lets a pair be scheduled before its rooms are known', async () => {
			// Neither section has a room yet, so there is nothing to clash on, and
			// the year's first write must not be blocked waiting for one.
			const t = await asEslAdmin();
			const { classA, classB } = await createG10Pair(t);

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classA,
					year: '2025-2026',
					meetings: TWO
				})
			).resolves.toMatchObject({ success: true });
			expect(classB).toBeDefined();
		});
	});

	describe('the room and teacher gates', () => {
		/**
		 * Two classes in different cohorts, both scheduled, both with a room.
		 *
		 * The second one is left unassigned so a test can hand it the first's room,
		 * which is the shape of the bypass this closes.
		 */
		const twoScheduled = async (t: ConvexTestInstance) => {
			const first = (await createG7(t, '1')).classIds[0];
			const second = (await createG7(t, '2')).classIds[0];
			await t.mutation(api.esl.classes.setRoom, { classId: first, room: 'ESL A' });
			await t.mutation(api.esl.classes.setSchedule, {
				classId: first,
				year: '2025-2026',
				meetings: THREE
			});
			await t.mutation(api.esl.classes.setSchedule, {
				classId: second,
				year: '2025-2026',
				meetings: THREE
			});
			return { first, second };
		};

		it('refuses a room another class already holds at the same slot', async () => {
			// The bypass this closes: the slots were gated, but the room was not, so
			// the conflict could be created after the fact however carefully the
			// schedule was chosen.
			const t = await asEslAdmin();
			const { first, second } = await twoScheduled(t);

			await expect(
				t.mutation(api.esl.classes.setRoom, { classId: second, room: 'ESL A' })
			).rejects.toThrow(/ESL A is taken by/);
			expect(first).toBeDefined();
		});

		it('allows that room once the classes are in different slots', async () => {
			const t = await asEslAdmin();
			const { second } = await twoScheduled(t);
			await t.mutation(api.esl.classes.setSchedule, {
				classId: second,
				year: '2025-2026',
				meetings: [
					{ day: 'Tuesday', period: 5 },
					{ day: 'Thursday', period: 6 },
					{ day: 'Friday', period: 7 }
				]
			});

			await expect(
				t.mutation(api.esl.classes.setRoom, { classId: second, room: 'ESL A' })
			).resolves.toMatchObject({ success: true, room: 'ESL A' });
		});

		it('lets a room be cleared to fix a clash', async () => {
			// A class already in a double-booked room — legacy data, a restore — must
			// be able to escape it. Refusing the correction would leave no way out.
			const t = await asEslAdmin();
			const { first, second } = await twoScheduled(t);
			await t.run((ctx) => ctx.db.patch(second, { room: 'ESL A' }));

			await expect(
				t.mutation(api.esl.classes.setRoom, { classId: second, room: '' })
			).resolves.toMatchObject({ success: true, room: null });
			expect(first).toBeDefined();
		});

		it('does not refuse a room over a cohort clash the room cannot fix', async () => {
			// The trap the targeted gate exists to avoid. The class's *saved* week
			// already breaks a cohort rule, put there directly; changing its room
			// neither causes nor could cure that, so the room save must still go
			// through or the admin is stuck.
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);
			await t.run((ctx) => ctx.db.patch(classIds[0], { room: 'ESL A' }));
			await seedWeek(t, classIds[1], '2025-2026', [
				{ day: 'Monday', period: 1 },
				{ day: 'Tuesday', period: 2 }
			]);
			await seedWeek(t, classIds[0], '2025-2026', [
				{ day: 'Monday', period: 1 },
				{ day: 'Wednesday', period: 2 },
				{ day: 'Friday', period: 3 }
			]);

			await expect(
				t.mutation(api.esl.classes.setRoom, { classId: classIds[0], room: 'ESL B' })
			).resolves.toMatchObject({ success: true, room: 'ESL B' });
		});

		it('refuses a teacher already teaching elsewhere at the same slot', async () => {
			const t = await asEslAdmin();
			const { first, second } = await twoScheduled(t);
			const teacher = await seedUser(t, { authId: 'ms-rao', name: 'Ms Rao' });

			await t.mutation(api.esl.classes.assignTeacher, { id: first, teacherId: teacher });

			await expect(
				t.mutation(api.esl.classes.assignTeacher, { id: second, teacherId: teacher })
			).rejects.toThrow(/has the same teacher/);
		});

		it("refuses a teacher blocked for one of the class's slots", async () => {
			const t = await asEslAdmin();
			const { first } = await twoScheduled(t);
			const teacher = await seedUser(t, { authId: 'ms-rao', name: 'Ms Rao' });

			await t.run((ctx) =>
				ctx.db.insert('esl_teacher_availability', {
					teacherId: teacher,
					year: '2025-2026',
					day: 'Monday',
					period: 1,
					note: 'lunch duty'
				})
			);

			await expect(
				t.mutation(api.esl.classes.assignTeacher, { id: first, teacherId: teacher })
			).rejects.toThrow(/lunch duty/);
		});

		it('refuses the one teacher both classes of a cohort are given', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);
			const teacher = await seedUser(t, { authId: 'ms-rao', name: 'Ms Rao' });

			await t.mutation(api.esl.classes.assignTeacher, { id: classIds[0], teacherId: teacher });

			await expect(
				t.mutation(api.esl.classes.assignTeacher, { id: classIds[1], teacherId: teacher })
			).rejects.toThrow(/need different ones/);
		});

		it('lets a teacher be cleared to fix a clash', async () => {
			const t = await asEslAdmin();
			const { first, second } = await twoScheduled(t);
			const teacher = await seedUser(t, { authId: 'ms-rao', name: 'Ms Rao' });
			await t.run((ctx) => {
				void ctx.db.patch(first, { teacherId: teacher });
				return ctx.db.patch(second, { teacherId: teacher });
			});

			await expect(
				t.mutation(api.esl.classes.assignTeacher, { id: second })
			).resolves.toMatchObject({ success: true });
		});
	});

	describe('listScheduleByYear', () => {
		it('returns every class in the year with its meetings and room', async () => {
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: [
					{ day: 'Monday', period: 1 },
					{ day: 'Wednesday', period: 2 },
					{ day: 'Friday', period: 3 }
				]
			});
			await t.mutation(api.esl.classes.setRoom, { classId: classIds[0], room: 'ESL A' });

			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });

			expect(rows).toHaveLength(2);
			// Annotated because `src/convex/tsconfig.json` (the config Convex's own
			// push typecheck uses) does not infer the query's return type here, and
			// `noImplicitAny` then rejects the callback parameter.
			const clil = rows.find((row: { classId: Id<'esl_classes'> }) => row.classId === classIds[0]);
			expect(clil).toMatchObject({ room: 'ESL A', scheduleLabel: null });
			expect(clil?.meetings).toHaveLength(3);
		});

		it('returns nothing for a year with no cohorts', async () => {
			const t = await asEslAdmin();

			await expect(
				t.query(api.esl.classes.listScheduleByYear, { year: '1999-2000' })
			).resolves.toEqual([]);
		});

		describe('archived classes', () => {
			/**
			 * Two G7 classes in *different* cohorts, both in one room, both in one
			 * slot — a real room clash.
			 *
			 * Not the two sections of one cohort: those are barred from sharing a slot
			 * by rule, so they cannot be made to clash, and a fixture that pretends
			 * otherwise tests nothing. A shared room across two cohorts is the
			 * ordinary clash this guard exists for.
			 */
			const roomClash = async (t: ConvexTestInstance) => {
				const first = (await createG7(t, '1')).classIds[0];
				const second = (await createG7(t, '2')).classIds[0];
				// Rooms first, while neither class has a schedule, so there is nothing
				// to clash with. The clash is then created by seeding rows directly:
				// both the schedule gate and the room gate now refuse to create one,
				// which is the point — so pre-existing conflicted data is the only
				// state these archived tests can be about.
				for (const classId of [first, second]) {
					await t.mutation(api.esl.classes.setRoom, { classId, room: 'ESL A' });
				}
				await seedWeek(t, first, '2025-2026', THREE);
				await seedWeek(t, second, '2025-2026', THREE);
				return { first, second };
			};

			const rowsFor = async (t: ConvexTestInstance): Promise<ScheduleRow[]> =>
				t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });

			it('stops a retired class from flagging a live one', async () => {
				// The bug this covers: retirement was read off the *cohort* only, so a
				// single archived class inside an active cohort stayed in the neighbour
				// set — red-flagging real classes while being invisible and uneditable.
				const t = await asEslAdmin();
				const { first, second } = await roomClash(t);

				await t.mutation(api.esl.classes.setStatus, { id: second, status: 'archived' });

				const rows = await rowsFor(t);
				const live = rows.find((row) => row.classId === first);
				expect(live?.problems).toEqual([]);
			});

			it('leaves the clash standing while both classes are live', async () => {
				// The control for the test above: the fixture really does clash, so a
				// clean result above means the guard did something, not that there was
				// never anything to find.
				const t = await asEslAdmin();
				const { first } = await roomClash(t);

				const rows = await rowsFor(t);
				const live = rows.find((row) => row.classId === first);
				expect(live?.problems.length).toBeGreaterThan(0);
			});

			it('still returns the retired class, with its meetings', async () => {
				// Archiving retires a card; it does not delete it. Dropping the row left
				// the card with no schedule at all, which reads as "Loading…" forever.
				const t = await asEslAdmin();
				const { second } = await roomClash(t);

				await t.mutation(api.esl.classes.setStatus, { id: second, status: 'archived' });

				const rows = await rowsFor(t);
				const retired = rows.find((row) => row.classId === second);
				expect(retired?.meetings).toEqual(THREE);
				expect(retired?.archived).toBe(true);
			});

			it('reports a retired class as sound, not as a work item', async () => {
				// A class archived mid-year must not sit on the page demanding a
				// schedule or a room that nobody is going to give it.
				const t = await asEslAdmin();
				const { classIds } = await createG7(t);

				await t.mutation(api.esl.classes.setStatus, { id: classIds[0], status: 'archived' });

				const rows = await rowsFor(t);
				const retired = rows.find((row) => row.classId === classIds[0]);
				expect(retired).toMatchObject({
					archived: true,
					scheduleProblem: null,
					scheduleLabel: null
				});
				expect(retired?.problems).toEqual([]);
			});

			it('keeps an archived cohort on the page', async () => {
				// Archiving a year is the same promise: the cards stay, retired.
				const t = await asEslAdmin();
				const { classIds } = await createG7(t);

				await t.mutation(api.esl.cohorts.archiveYear, { year: '2025-2026' });

				const rows = await rowsFor(t);
				expect(rows.map((row) => row.classId).sort()).toEqual([...classIds].sort());
				expect(rows.every((row) => row.archived)).toBe(true);
			});
		});

		it('refuses a caller who is not ESL staff', async () => {
			const t = await asEslAdmin();
			await createG7(t);
			mockAuthUser(null);

			await expect(
				t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' })
			).rejects.toThrow('Unauthorized');
		});

		it('reports a class saved onto a blocked slot, quoting the note', async () => {
			// The read feeds the teacher's blocked rows into the same gate the write
			// runs: a clash from before the rule, a restore, or an import must show
			// on the card, not only refuse the next save.
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);
			const teacher = await seedUser(t, { authId: 'ms-rao', name: 'Ms Rao' });

			await t.run((ctx) =>
				ctx.db.insert('esl_teacher_availability', {
					teacherId: teacher,
					year: '2025-2026',
					day: 'Monday',
					period: 1,
					note: 'lunch duty'
				})
			);
			// Seeded directly: the write gate refuses to create this state, which
			// is the point — the read has to report what the gate would not write.
			await t.run((ctx) => ctx.db.patch(classIds[0], { teacherId: teacher }));
			await seedWeek(t, classIds[0], '2025-2026', THREE);

			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const row = rows.find((candidate: ScheduleRow) => candidate.classId === classIds[0]);
			expect(row?.problems).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ kind: 'teacher-availability', day: 'Monday', period: 1 })
				])
			);
		});
	});

	describe('setSchedule with room', () => {
		it('saves the room with the week in one call', async () => {
			// The picker flow: slots and room drafted together, one Save. The room
			// rides the same transaction as the meetings, so the class cannot land
			// scheduled-but-unroomed between two writes.
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: THREE,
				room: 'ESL C'
			});

			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const row = rows.find((candidate: ScheduleRow) => candidate.classId === classIds[0]);
			expect(row).toMatchObject({ room: 'ESL C', scheduleLabel: null });
			expect(row?.meetings).toHaveLength(3);
		});

		it('judges the proposed room, not the saved one', async () => {
			// The class itself is unroomed, so nothing about its saved state clashes —
			// but the room it is *moving into* is taken at those slots.
			const t = await asEslAdmin();
			const first = (await createG7(t, '1')).classIds[0];
			const second = (await createG7(t, '2')).classIds[0];

			await t.mutation(api.esl.classes.setRoom, { classId: second, room: 'ESL A' });
			await t.mutation(api.esl.classes.setSchedule, {
				classId: second,
				year: '2025-2026',
				meetings: THREE
			});

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: first,
					year: '2025-2026',
					meetings: THREE,
					room: 'ESL A'
				})
			).rejects.toThrow(/ESL A is taken by .*CLIL/);

			// And the refused save wrote nothing: no meetings, no room.
			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const row = rows.find((candidate: ScheduleRow) => candidate.classId === first);
			expect(row?.meetings).toEqual([]);
			expect(row).toMatchObject({ room: null });
		});

		it('clears the room when given a blank', async () => {
			// Blank means "no room known yet", on the same rule as `setRoom`: a
			// whitespace-only value would otherwise satisfy `room !== ''` while
			// reading as a room on the badge.
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setRoom, { classId: classIds[0], room: 'ESL A' });
			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: THREE,
				room: '   '
			});

			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const row = rows.find((candidate: ScheduleRow) => candidate.classId === classIds[0]);
			expect(row).toMatchObject({ room: null });
			expect(row?.meetings).toHaveLength(3);
		});

		it('leaves the room alone when none is sent', async () => {
			// Absent means "leave the room as it is", so existing callers — and a
			// picker that only changed slots — are unaffected.
			const t = await asEslAdmin();
			const { classIds } = await createG7(t);

			await t.mutation(api.esl.classes.setRoom, { classId: classIds[0], room: 'ESL A' });
			await t.mutation(api.esl.classes.setSchedule, {
				classId: classIds[0],
				year: '2025-2026',
				meetings: THREE
			});

			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const row = rows.find((candidate: ScheduleRow) => candidate.classId === classIds[0]);
			expect(row).toMatchObject({ room: 'ESL A' });
		});
	});

	describe('the grade 10 pair room', () => {
		it('refuses a draft room the partner already holds, naming both sections', async () => {
			// The pair's own rule against the *proposal*: the saved rooms differ, so
			// only the draft collides — and the sentence names the pair, not "taken
			// by H101B".
			const t = await asEslAdmin();
			const { classA, classB } = await createG10Pair(t);
			await t.mutation(api.esl.classes.setRoom, { classId: classA, room: 'ESL A' });
			await t.mutation(api.esl.classes.setRoom, { classId: classB, room: 'ESL B' });

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classA,
					year: '2025-2026',
					meetings: TWO,
					room: 'ESL B'
				})
			).rejects.toThrow(/both meet in ESL B.*different rooms/);
		});

		it('saves the draft room to the calling section only', async () => {
			// Rooms stay independent across the pair: identical slots never force
			// identical rooms, and the partner's room is not rewritten by a save
			// from this card.
			const t = await asEslAdmin();
			const { classA, classB } = await createG10Pair(t);
			await t.mutation(api.esl.classes.setRoom, { classId: classB, room: 'ESL B' });

			await t.mutation(api.esl.classes.setSchedule, {
				classId: classA,
				year: '2025-2026',
				meetings: TWO,
				room: 'ESL A'
			});

			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const a = rows.find((row: ScheduleRow) => row.classId === classA);
			const b = rows.find((row: ScheduleRow) => row.classId === classB);
			expect(a).toMatchObject({ room: 'ESL A' });
			expect(b).toMatchObject({ room: 'ESL B' });
			expect(a?.meetings).toEqual(TWO);
			expect(b?.meetings).toEqual(TWO);
		});

		it('leaves the room as well as the week on a refused pair save', async () => {
			// Atomicity covers the room patch too: the gate judged the week against
			// the draft room, so a refusal must persist neither.
			const t = await asEslAdmin();
			const { classA, classB } = await createG10Pair(t);
			await t.mutation(api.esl.classes.setRoom, { classId: classA, room: 'ESL A' });
			await t.mutation(api.esl.classes.setRoom, { classId: classB, room: 'ESL B' });
			await t.mutation(api.esl.classes.setSchedule, {
				classId: classB,
				year: '2025-2026',
				meetings: TWO
			});

			const moved = [
				{ day: 'Monday' as const, period: 1 },
				{ day: 'Tuesday' as const, period: 2 }
			];
			const other = (await createG7(t, '1')).classIds[0];
			await t.run((ctx) => ctx.db.patch(other, { room: 'ESL C' }));
			await seedWeek(t, other, '2025-2026', moved);

			await expect(
				t.mutation(api.esl.classes.setSchedule, {
					classId: classA,
					year: '2025-2026',
					meetings: moved,
					room: 'ESL C'
				})
			).rejects.toThrow(/ESL C is taken by/);

			const rows = await t.query(api.esl.classes.listScheduleByYear, { year: '2025-2026' });
			const a = rows.find((row: ScheduleRow) => row.classId === classA);
			const b = rows.find((row: ScheduleRow) => row.classId === classB);
			expect(a?.meetings).toEqual(TWO);
			expect(b?.meetings).toEqual(TWO);
			expect(a).toMatchObject({ room: 'ESL A' });
		});
	});

	describe('listRoomSuggestions', () => {
		/**
		 * Puts roster rows on a cohort.
		 *
		 * `chineseClass` is the stored form — usually the bare number (`01`),
		 * occasionally the school's full form on an old row — and `undefined`
		 * for a row `advanceGrade` created, whose homeroom is not yet knowable.
		 */
		const seedRoster = async (
			t: ConvexTestInstance,
			cohortId: Id<'esl_cohorts'>,
			members: readonly { chineseClass?: string; status?: 'active' | 'disabled' }[]
		) => {
			for (const [index, member] of members.entries()) {
				await t.run(async (ctx) =>
					ctx.db.insert('esl_students', {
						cohortId,
						chineseName: `學生${index}`,
						schoolStudentId: `70010${String(index).padStart(2, '0')}`,
						status: member.status ?? 'active',
						enrolledAt: 1,
						...(member.chineseClass === undefined ? {} : { chineseClass: member.chineseClass })
					})
				);
			}
		};

		it('always offers the department rooms', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const suggestions = await t.query(api.esl.classes.listRoomSuggestions, { cohortId });

			expect(suggestions.department).toEqual([
				'ESL A',
				'ESL B',
				'ESL C',
				'ESL D',
				'ESL E',
				'ESL F',
				'ESL G'
			]);
		});

		it('derives homerooms from the active roster, ascending', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await seedRoster(t, cohortId, [
				{ chineseClass: '03' },
				{ chineseClass: '01' },
				{ chineseClass: '01' }
			]);

			const suggestions = await t.query(api.esl.classes.listRoomSuggestions, { cohortId });

			expect(suggestions.homerooms).toEqual(['J101', 'J103']);
		});

		it('offers no homerooms for an empty roster', async () => {
			// A fresh import shows no fabricated hints: the department rooms are
			// the whole vocabulary until students arrive.
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);

			const suggestions = await t.query(api.esl.classes.listRoomSuggestions, { cohortId });

			expect(suggestions.homerooms).toEqual([]);
			expect(suggestions.department).toHaveLength(7);
		});

		it('ignores transferred students and rows with no homeroom yet', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await seedRoster(t, cohortId, [
				{ chineseClass: '01' },
				{ chineseClass: '02', status: 'disabled' },
				{}
			]);

			const suggestions = await t.query(api.esl.classes.listRoomSuggestions, { cohortId });

			expect(suggestions.homerooms).toEqual(['J101']);
		});

		it('re-derives a legacy full-form value through the grade', async () => {
			// A row written before the bare-number split still suggests a room —
			// and the grade's own marker wins over a stored one that disagrees.
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await seedRoster(t, cohortId, [{ chineseClass: 'J101' }, { chineseClass: 'J201' }]);

			const suggestions = await t.query(api.esl.classes.listRoomSuggestions, { cohortId });

			expect(suggestions.homerooms).toEqual(['J101']);
		});

		it('refuses an unknown cohort', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			await t.run(async (ctx) => ctx.db.delete(cohortId));

			await expect(t.query(api.esl.classes.listRoomSuggestions, { cohortId })).rejects.toThrow(
				'Cohort not found'
			);
		});

		it('refuses a caller who is not ESL staff', async () => {
			const t = await asEslAdmin();
			const { cohortId } = await createG7(t);
			mockAuthUser(null);

			await expect(t.query(api.esl.classes.listRoomSuggestions, { cohortId })).rejects.toThrow(
				'Unauthorized'
			);
		});
	});
});
