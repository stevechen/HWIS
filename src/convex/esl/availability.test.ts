import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	convexTest,
	modules,
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

/** A teacher to block slots for, signed in as someone else (the admin). */
async function seedTeacher(t: ConvexTestInstance, authId: string): Promise<Id<'users'>> {
	return seedEslStaff(t, { authId, eslRole: 'teacher', signIn: false });
}

const blocksFor = async (t: ConvexTestInstance, teacherId: Id<'users'>, year: string) =>
	t.run(async (ctx) =>
		ctx.db
			.query('esl_teacher_availability')
			.withIndex('by_teacher_year', (q) => q.eq('teacherId', teacherId).eq('year', year))
			.collect()
	);

describe('esl teacher availability', () => {
	afterEach(() => vi.restoreAllMocks());

	describe('setBlocks', () => {
		it('stores the staged blocks for a year', async () => {
			const t = await asEslAdmin();
			const teacher = await seedTeacher(t, 'ms-rao');

			const result = await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2025-2026',
				blocks: [
					{ day: 'Monday', period: 1, note: 'lunch duty' },
					{ day: 'Friday', period: 8 }
				]
			});

			expect(result).toMatchObject({ success: true, count: 2 });
			const rows = await blocksFor(t, teacher, '2025-2026');
			expect(rows).toHaveLength(2);
			expect(rows).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ day: 'Monday', period: 1, note: 'lunch duty' }),
					expect.objectContaining({ day: 'Friday', period: 8 })
				])
			);
		});

		it('replaces the previous year rather than adding to it', async () => {
			// The dialog stages a complete set and commits it: a second save states
			// the year's blocks unambiguously, so a slot unblocked between saves
			// must not linger.
			const t = await asEslAdmin();
			const teacher = await seedTeacher(t, 'ms-rao');

			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2025-2026',
				blocks: [
					{ day: 'Monday', period: 1 },
					{ day: 'Tuesday', period: 2 }
				]
			});
			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2025-2026',
				blocks: [{ day: 'Wednesday', period: 3 }]
			});

			const rows = await blocksFor(t, teacher, '2025-2026');
			expect(rows.map((row) => `${row.day} P${row.period}`)).toEqual(['Wednesday P3']);
		});

		it('clears the year when given no blocks', async () => {
			// Unblocking everything is a real edit — a part-time teacher going
			// full-time — so an empty stage must delete rather than no-op.
			const t = await asEslAdmin();
			const teacher = await seedTeacher(t, 'ms-rao');

			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2025-2026',
				blocks: [{ day: 'Monday', period: 1 }]
			});
			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2025-2026',
				blocks: []
			});

			expect(await blocksFor(t, teacher, '2025-2026')).toHaveLength(0);
		});

		it('leaves other years and other teachers alone', async () => {
			const t = await asEslAdmin();
			const teacher = await seedTeacher(t, 'ms-rao');
			const other = await seedTeacher(t, 'mr-chen');

			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2024-2025',
				blocks: [{ day: 'Monday', period: 1 }]
			});
			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: other,
				year: '2025-2026',
				blocks: [{ day: 'Monday', period: 1 }]
			});
			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2025-2026',
				blocks: []
			});

			expect(await blocksFor(t, teacher, '2024-2025')).toHaveLength(1);
			expect(await blocksFor(t, other, '2025-2026')).toHaveLength(1);
		});

		it('drops a blank note rather than storing an empty sentence', async () => {
			const t = await asEslAdmin();
			const teacher = await seedTeacher(t, 'ms-rao');

			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2025-2026',
				blocks: [{ day: 'Monday', period: 1, note: '   ' }]
			});

			const rows = await blocksFor(t, teacher, '2025-2026');
			expect(rows).toHaveLength(1);
			expect(rows[0]).not.toHaveProperty('note');
		});

		it('trims a note but keeps it', async () => {
			const t = await asEslAdmin();
			const teacher = await seedTeacher(t, 'ms-rao');

			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2025-2026',
				blocks: [{ day: 'Monday', period: 1, note: '  lunch duty  ' }]
			});

			const rows = await blocksFor(t, teacher, '2025-2026');
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ note: 'lunch duty' });
		});

		it('refuses a period the school does not run, naming it', async () => {
			const t = await asEslAdmin();
			const teacher = await seedTeacher(t, 'ms-rao');

			await expect(
				t.mutation(api.esl.availability.setBlocks, {
					teacherId: teacher,
					year: '2025-2026',
					blocks: [{ day: 'Monday', period: 9 }]
				})
			).rejects.toThrow('Period 9 is not on the school timetable');
		});

		it('refuses the same slot twice', async () => {
			const t = await asEslAdmin();
			const teacher = await seedTeacher(t, 'ms-rao');

			await expect(
				t.mutation(api.esl.availability.setBlocks, {
					teacherId: teacher,
					year: '2025-2026',
					blocks: [
						{ day: 'Monday', period: 1 },
						{ day: 'Monday', period: 1 }
					]
				})
			).rejects.toThrow('Monday P1 is blocked twice');
		});

		it('refuses an unknown teacher', async () => {
			const t = await asEslAdmin();
			const teacher = await seedUser(t, { authId: 'ms-rao' });
			await t.run(async (ctx) => ctx.db.delete(teacher));

			await expect(
				t.mutation(api.esl.availability.setBlocks, {
					teacherId: teacher,
					year: '2025-2026',
					blocks: []
				})
			).rejects.toThrow('Teacher not found');
		});

		it('refuses a write from a caller who is not an ESL admin', async () => {
			const t = convexTest(schema, modules);
			await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin', signIn: false });
			const teacher = await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });

			await expect(
				t.mutation(api.esl.availability.setBlocks, {
					teacherId: teacher,
					year: '2025-2026',
					blocks: []
				})
			).rejects.toThrow('Forbidden: ESL admin access required');
		});
	});

	describe('listByYear', () => {
		it('returns one year of blocks, with notes, for every teacher', async () => {
			const t = await asEslAdmin();
			const teacher = await seedTeacher(t, 'ms-rao');
			const other = await seedTeacher(t, 'mr-chen');

			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2025-2026',
				blocks: [{ day: 'Monday', period: 1, note: 'lunch duty' }]
			});
			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: other,
				year: '2025-2026',
				blocks: [{ day: 'Friday', period: 8 }]
			});
			await t.mutation(api.esl.availability.setBlocks, {
				teacherId: teacher,
				year: '2024-2025',
				blocks: [{ day: 'Tuesday', period: 2 }]
			});

			const rows = await t.query(api.esl.availability.listByYear, { year: '2025-2026' });
			expect(rows).toHaveLength(2);
			expect(rows).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						teacherId: teacher,
						day: 'Monday',
						period: 1,
						note: 'lunch duty'
					}),
					expect.objectContaining({ teacherId: other, day: 'Friday', period: 8 })
				])
			);
		});
	});
});
