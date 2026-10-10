import { describe, it, expect } from 'vitest';
import { boundaryCrossWarning, derivedEndSource, semesterStatus } from '$lib/esl-semesters';

describe('semesterStatus', () => {
	it('marks a semester before its start as upcoming', async () => {
		await expect(
			semesterStatus({ startDate: '2025-09-01', derivedEnd: '2026-01-20' }, '2025-08-15')
		).toBe('upcoming');
	});

	it('marks a semester on its start date as current', async () => {
		await expect(
			semesterStatus({ startDate: '2025-09-01', derivedEnd: '2026-01-20' }, '2025-09-01')
		).toBe('current');
	});

	it('marks a semester on its derived end as still current', async () => {
		await expect(
			semesterStatus({ startDate: '2025-09-01', derivedEnd: '2026-01-20' }, '2026-01-20')
		).toBe('current');
	});

	it('marks a semester past its derived end as closed', async () => {
		await expect(
			semesterStatus({ startDate: '2025-09-01', derivedEnd: '2026-01-20' }, '2026-01-21')
		).toBe('closed');
	});

	it('marks an exam-less semester after its start as current (finals TBD)', async () => {
		await expect(semesterStatus({ startDate: '2025-09-01', derivedEnd: null }, '2025-10-01')).toBe(
			'current'
		);
	});

	it('marks an exam-less semester before its start as upcoming', async () => {
		await expect(semesterStatus({ startDate: '2025-09-01', derivedEnd: null }, '2025-08-01')).toBe(
			'upcoming'
		);
	});
});

describe('derivedEndSource', () => {
	it('returns null while no exams exist', async () => {
		await expect(derivedEndSource([], null)).toBeNull();
	});

	it('names the exam row the derived end came from', async () => {
		await expect(
			derivedEndSource(
				[
					{ type: 'exam', date: '2026-01-18', label: 'Exam 1' },
					{ type: 'exam', date: '2026-01-20', label: 'Final exam' },
					{ type: 'off', date: '2026-01-20', label: 'Should never match' }
				],
				'2026-01-20'
			)
		).toEqual({ date: '2026-01-20', label: 'Final exam' });
	});

	it('falls back to a generic exam label when no row matches the end', async () => {
		await expect(derivedEndSource([], '2026-01-20')).toEqual({
			date: '2026-01-20',
			label: 'exam'
		});
	});
});

describe('boundaryCrossWarning', () => {
	const s2Sibling = { year: '2025-2026', term: 'S2' as const, startDate: '2026-02-09' };
	const s1Sibling = {
		year: '2025-2026',
		term: 'S1' as const,
		startDate: '2025-09-01',
		derivedEnd: '2026-01-20'
	};

	it('warns when an S1 exam lands on or after the S2 start', async () => {
		const warning = boundaryCrossWarning({
			term: 'S1',
			type: 'exam',
			date: '2026-02-10',
			sibling: s2Sibling
		});
		await expect(warning).toContain('S2');
	});

	it('stays silent for an S1 exam inside its own term', async () => {
		await expect(
			boundaryCrossWarning({ term: 'S1', type: 'exam', date: '2026-01-20', sibling: s2Sibling })
		).toBeNull();
	});

	it('warns when an S2 exam lands on or before the S1 derived end', async () => {
		const warning = boundaryCrossWarning({
			term: 'S2',
			type: 'exam',
			date: '2026-01-15',
			sibling: s1Sibling
		});
		await expect(warning).toContain('S1');
	});

	it('stays silent for an S2 exam after the S1 end', async () => {
		await expect(
			boundaryCrossWarning({ term: 'S2', type: 'exam', date: '2026-06-10', sibling: s1Sibling })
		).toBeNull();
	});

	it('stays silent for non-exam types even across the boundary', async () => {
		await expect(
			boundaryCrossWarning({ term: 'S1', type: 'off', date: '2026-02-10', sibling: s2Sibling })
		).toBeNull();
	});

	it('stays silent when there is no sibling semester yet', async () => {
		await expect(
			boundaryCrossWarning({ term: 'S1', type: 'exam', date: '2026-02-10', sibling: null })
		).toBeNull();
	});
});
