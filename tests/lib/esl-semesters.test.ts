import { describe, it, expect } from 'vite-plus/test';
import {
	parseSemesterSlug,
	pickDefaultSemester,
	semesterSlug,
	semesterUploadYears
} from '$lib/esl-semesters';

describe('pickDefaultSemester', () => {
	const S1 = { id: 's1', startDate: '2026-08-31', derivedEnd: '2027-01-20' };
	const S2 = { id: 's2', startDate: '2027-02-11', derivedEnd: null };

	it('prefers the running term over a future sibling, even though the list is newest-first', () => {
		expect(pickDefaultSemester([S2, S1], '2026-10-21')?.id).toBe('s1');
	});

	it('falls back to the most recent started term when none is running', () => {
		const past = { id: 'p2', startDate: '2027-02-11', derivedEnd: '2027-06-30' };
		const older = { id: 'p1', startDate: '2026-08-31', derivedEnd: '2027-01-20' };
		expect(pickDefaultSemester([past, older], '2026-10-21')?.id).toBe('p1');
	});

	it('falls back to the first row when every term is still upcoming', () => {
		expect(pickDefaultSemester([S2], '2026-10-21')?.id).toBe('s2');
	});

	it('returns null for an empty list', () => {
		expect(pickDefaultSemester([], '2026-10-21')).toBeNull();
	});
});

describe('semesterUploadYears (#208 both-year S1 setup)', () => {
	it('spans both Gregorian years for an S1 fall start (fall 2026 → 2026+2027)', () => {
		expect(semesterUploadYears('S1', '2026-09-01')).toEqual(['2026', '2027']);
	});

	it('spans both Gregorian years for any S1 start', () => {
		expect(semesterUploadYears('S1', '2025-08-31')).toEqual(['2025', '2026']);
	});

	it('stays in one Gregorian year for an S2 spring start', () => {
		expect(semesterUploadYears('S2', '2026-02-09')).toEqual(['2026']);
	});
});

describe('semesterSlug / parseSemesterSlug (friendly detail URLs)', () => {
	it('builds the slug as year + term', () => {
		expect(semesterSlug({ year: '2026-2027', term: 'S1' })).toBe('2026-2027-S1');
		expect(semesterSlug({ year: '2026-2027', term: 'S2' })).toBe('2026-2027-S2');
	});

	it('parses a slug back into year + term', () => {
		expect(parseSemesterSlug('2026-2027-S1')).toEqual({ year: '2026-2027', term: 'S1' });
		expect(parseSemesterSlug('2026-2027-S2')).toEqual({ year: '2026-2027', term: 'S2' });
	});

	it('rejects raw Convex ids and malformed slugs', () => {
		expect(parseSemesterSlug('n170eye7698qrbhp0kv4eezaf98g1m96')).toBeNull();
		expect(parseSemesterSlug('26-27-S1')).toBeNull();
		expect(parseSemesterSlug('2026-2027-S3')).toBeNull();
		expect(parseSemesterSlug('')).toBeNull();
	});

	it('round-trips slug → parse', () => {
		const semester = { year: '2026-2027', term: 'S1' as const };
		expect(parseSemesterSlug(semesterSlug(semester))).toEqual(semester);
	});
});
