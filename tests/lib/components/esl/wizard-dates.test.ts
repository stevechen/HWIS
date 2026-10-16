import { describe, it, expect } from 'vite-plus/test';
import {
	defaultStartDate,
	dueWindowDates,
	schoolYearForTerm,
	startPickerMondays,
	suggestSemester,
	type Term
} from '$lib/components/esl/wizard/wizard-dates';

/**
 * Suggestion logic and start-date defaults for wizard Step 1 (ticket #219).
 * Every expectation below is a hand-worked literal from the spec's acceptance
 * criteria — never recomputed through the helpers under test.
 */
describe('suggestSemester', () => {
	it('suggests S1 of the new school year for Jul–Sep', () => {
		for (const today of ['2026-07-01', '2026-08-15', '2026-09-30']) {
			expect(suggestSemester(today)).toEqual({
				term: 'S1',
				schoolYear: '2026-2027',
				reason: 'Jul–Sep: setting up this fall'
			});
		}
	});

	it('suggests S2 of the current school year for Jan–Feb', () => {
		for (const today of ['2026-01-05', '2026-02-11', '2026-02-28']) {
			expect(suggestSemester(today)).toEqual({
				term: 'S2',
				schoolYear: '2025-2026',
				reason: 'Jan–Feb: setting up this spring'
			});
		}
	});

	it('suggests S2 of the current school year for Mar–Jun', () => {
		for (const today of ['2026-03-01', '2026-04-10', '2026-06-30']) {
			expect(suggestSemester(today)).toEqual({
				term: 'S2',
				schoolYear: '2025-2026',
				reason: 'Mar–Jun: S2 of the current school year'
			});
		}
	});

	it('suggests S1 of next year for Oct–Dec', () => {
		for (const today of ['2026-10-01', '2026-11-20', '2026-12-31']) {
			expect(suggestSemester(today)).toEqual({
				term: 'S1',
				schoolYear: '2027-2028',
				reason: 'Oct–Dec: setting up next fall'
			});
		}
	});
});

describe('schoolYearForTerm', () => {
	// (term, expectedSchoolYear, today)
	const cases: Array<[Term, string, string]> = [
		// S1: the school year whose fall contains `today`.
		['S1', '2026-2027', '2026-10-15'],
		['S1', '2026-2027', '2026-08-01'],
		['S1', '2026-2027', '2026-07-01'],
		['S1', '2025-2026', '2026-03-10'],
		['S1', '2025-2026', '2026-01-20'],
		// S2: the school year whose spring contains `today`.
		['S2', '2025-2026', '2026-02-11'],
		['S2', '2025-2026', '2026-04-10'],
		['S2', '2025-2026', '2026-06-30'],
		['S2', '2026-2027', '2026-10-15'],
		['S2', '2026-2027', '2026-08-15']
	];

	it.each(cases)('derives %s → %s for today %s', (term, expected, today) => {
		expect(schoolYearForTerm(term, today)).toBe(expected);
	});
});

describe('defaultStartDate', () => {
	it('keeps Aug 30 as-is when it is a weekday', () => {
		// Aug 30 2027 is a Monday — the default stays on the anchor.
		expect(defaultStartDate('S1', '2027-2028')).toBe('2027-08-30');
	});

	it('rolls a weekend Aug 30 forward to the next Monday', () => {
		// Aug 30 2026 is a Sunday, Aug 30 2031 is a Saturday.
		expect(defaultStartDate('S1', '2026-2027')).toBe('2026-08-31');
		expect(defaultStartDate('S1', '2031-2032')).toBe('2031-09-01');
	});

	it('keeps Feb 11 as-is when it is a weekday', () => {
		// Feb 11 2026 is a Wednesday, Feb 11 2027 is a Thursday.
		expect(defaultStartDate('S2', '2025-2026')).toBe('2026-02-11');
		expect(defaultStartDate('S2', '2026-2027')).toBe('2027-02-11');
	});

	it('rolls a weekend Feb 11 forward to the next Monday', () => {
		// Feb 11 2024 is a Sunday.
		expect(defaultStartDate('S2', '2023-2024')).toBe('2024-02-12');
	});
});

describe('startPickerMondays', () => {
	it('renders 2 weekly rows for S1, starting with the default week', () => {
		expect(startPickerMondays('S1', '2026-2027')).toEqual(['2026-08-31', '2026-09-07']);
		expect(startPickerMondays('S1', '2027-2028')).toEqual(['2027-08-30', '2027-09-06']);
	});

	it('renders 3 weekly rows for S2, starting with the default week', () => {
		expect(startPickerMondays('S2', '2025-2026')).toEqual([
			'2026-02-09',
			'2026-02-16',
			'2026-02-23'
		]);
		expect(startPickerMondays('S2', '2026-2027')).toEqual([
			'2027-02-08',
			'2027-02-15',
			'2027-02-22'
		]);
	});
});

describe('dueWindowDates', () => {
	it('walks 5 school days skipping weekends', () => {
		// Mon 2026-10-05 → Fri 2026-10-09 straight (no skips).
		expect(dueWindowDates('2026-10-05', new Set(), '2027-01-20')).toEqual([
			'2026-10-05',
			'2026-10-06',
			'2026-10-07',
			'2026-10-08',
			'2026-10-09'
		]);
	});

	it('skips weekends mid-window', () => {
		// Thu 2026-10-08 start: Thu, Fri, then Mon–Wed (Sat/Sun skipped).
		expect(dueWindowDates('2026-10-08', new Set(), '2027-01-20')).toEqual([
			'2026-10-08',
			'2026-10-09',
			'2026-10-12',
			'2026-10-13',
			'2026-10-14'
		]);
	});

	it('skips off days and exam days in the skip set', () => {
		// Mon 2026-11-02 start with Tue off and Wed an exam day.
		expect(
			dueWindowDates('2026-11-02', new Set(['2026-11-03', '2026-11-04']), '2027-01-20')
		).toEqual(['2026-11-02', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10']);
	});

	it('stops at the term boundary with fewer than 5 days', () => {
		expect(dueWindowDates('2027-01-18', new Set(), '2027-01-20')).toEqual([
			'2027-01-18',
			'2027-01-19',
			'2027-01-20'
		]);
	});
});
