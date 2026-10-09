import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';

const YEAR = '2025-2026';

async function seededSemester() {
	const t = convexTest(schema, modules);
	await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
	const semesterId = await t.mutation(api.esl.semesters.create, {
		year: YEAR,
		term: 'S1',
		startDate: '2025-08-31'
	});
	return { t, semesterId };
}

describe('esl/events.create', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates a ranged task-due event with a default All target', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task_due',
			label: 'Passport check',
			date: '2025-09-17',
			endDate: '2025-09-24'
		});
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({
			type: 'task_due',
			target: 'all',
			date: '2025-09-17',
			endDate: '2025-09-24'
		});
	});

	it('refuses a range on a single-date type', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'off',
				label: 'Typhoon day',
				date: '2025-09-25',
				endDate: '2025-09-26'
			})
		).rejects.toThrow(/range/i);
	});

	it('refuses another event on an off day', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'off',
			label: 'Typhoon day',
			date: '2025-09-25'
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_class',
				label: 'Assembly',
				date: '2025-09-25'
			})
		).rejects.toThrow();
	});

	it('refuses another event on an exam day', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			label: 'Exam 1',
			date: '2025-10-16'
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'task_due',
				label: 'Passport check',
				date: '2025-10-16'
			})
		).rejects.toThrow();
	});

	it('refuses a second partial on one date', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'partial',
			label: 'BBQ',
			date: '2025-09-12',
			startPeriod: 3
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'partial',
				label: 'Late start',
				date: '2025-09-12',
				endPeriod: 2
			})
		).rejects.toThrow(/partial/i);
	});

	it('refuses out-of-range partial periods', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'partial',
				label: 'Late start',
				date: '2025-09-12',
				startPeriod: 9
			})
		).rejects.toThrow(/period/i);
	});

	it('refuses partial bounds on a non-partial type', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_class',
				label: 'Assembly',
				date: '2025-09-12',
				startPeriod: 3
			})
		).rejects.toThrow(/partial/i);
	});
});
