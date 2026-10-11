import { describe, it, expect } from 'vitest';
import { semesterUploadYears } from '$lib/esl-semesters';

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
