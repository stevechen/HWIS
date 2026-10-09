import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';

const YEAR = '2025-2026';

async function adminContext() {
	const t = convexTest(schema, modules);
	await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
	return t;
}

describe('esl/semesters.create', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates an S1 semester with an explicit start date', async () => {
		const t = await adminContext();
		const semesterId = await t.mutation(api.esl.semesters.create, {
			year: YEAR,
			term: 'S1',
			startDate: '2025-08-31'
		});
		expect(semesterId).toBeTruthy();
		const semester = await t.query(api.esl.semesters.get, { semesterId });
		expect(semester).toMatchObject({ year: YEAR, term: 'S1', startDate: '2025-08-31' });
	});

	it('refuses a duplicate (year, term) semester', async () => {
		const t = await adminContext();
		await t.mutation(api.esl.semesters.create, {
			year: YEAR,
			term: 'S1',
			startDate: '2025-08-31'
		});
		await expect(
			t.mutation(api.esl.semesters.create, {
				year: YEAR,
				term: 'S1',
				startDate: '2025-09-01'
			})
		).rejects.toThrow();
	});

	it('refuses a malformed start date', async () => {
		const t = await adminContext();
		await expect(
			t.mutation(api.esl.semesters.create, {
				year: YEAR,
				term: 'S1',
				startDate: 'not-a-date'
			})
		).rejects.toThrow();
	});

	it('refuses semester creation for non-admin staff', async () => {
		const t = convexTest(schema, modules);
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(
			t.mutation(api.esl.semesters.create, {
				year: YEAR,
				term: 'S1',
				startDate: '2025-08-31'
			})
		).rejects.toThrow(/ESL admin/);
	});
});

describe('esl/semesters derived end', () => {
	it('is null before the first final exam exists (finals TBD)', async () => {
		const t = await adminContext();
		const semesterId = await t.mutation(api.esl.semesters.create, {
			year: YEAR,
			term: 'S1',
			startDate: '2025-08-31'
		});
		const semester = await t.query(api.esl.semesters.get, { semesterId });
		expect(semester?.derivedEnd).toBeNull();
	});

	it('pins to the max exam date once finals exist', async () => {
		const t = await adminContext();
		const semesterId = await t.mutation(api.esl.semesters.create, {
			year: YEAR,
			term: 'S1',
			startDate: '2025-08-31'
		});
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			label: 'Exam 1',
			date: '2025-10-16'
		});
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			label: 'Final exam',
			date: '2026-01-20'
		});
		const semester = await t.query(api.esl.semesters.get, { semesterId });
		expect(semester?.derivedEnd).toBe('2026-01-20');
	});
});
