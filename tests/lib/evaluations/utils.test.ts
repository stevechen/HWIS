import { describe, it, expect } from 'vitest';
import { transformEvaluation, sortEvaluations, matchesMultiSearch } from '$lib/evaluations/utils';
import type { EvaluationEntry } from '$lib/components/timeline/types';

describe('transformEvaluation', () => {
	it('transforms API response to EvaluationEntry', () => {
		const input = {
			_id: 'eval-1',
			value: 5,
			category: 'Academic',
			categoryId: 'cat-1',
			details: 'Good work',
			timestamp: 1234567890,
			englishName: 'John Smith',
			grade: 10,
			studentId: 'student-1',
			studentIdCode: 'SE2024001',
			teacherName: 'Ms. Johnson',
			teacherId: 'teacher-1',
			status: 'Enrolled' as const,
			isAdmin: false
		};

		const result = transformEvaluation(input);
		expect(result).toEqual(input);
	});

	it('handles missing optional fields', () => {
		const input = {
			_id: 'eval-1',
			value: 5,
			category: 'Academic',
			timestamp: 1234567890
		};

		const result = transformEvaluation(input);
		expect(result._id).toBe('eval-1');
		expect(result.value).toBe(5);
		expect(result.category).toBe('Academic');
		expect(result.timestamp).toBe(1234567890);
		expect(result.categoryId).toBeUndefined();
		expect(result.details).toBeUndefined();
		expect(result.englishName).toBeUndefined();
		expect(result.teacherName).toBeUndefined();
	});

	it('preserves status field', () => {
		const input = {
			_id: 'eval-1',
			value: 5,
			category: 'Academic',
			timestamp: 1234567890,
			status: 'Not Enrolled' as const
		};

		const result = transformEvaluation(input);
		expect(result.status).toBe('Not Enrolled');
	});

	it('preserves isAdmin flag', () => {
		const input = {
			_id: 'eval-1',
			value: 10,
			category: 'Special',
			timestamp: 1234567890,
			isAdmin: true
		};

		const result = transformEvaluation(input);
		expect(result.isAdmin).toBe(true);
	});
});

describe('sortEvaluations', () => {
	const evaluations: EvaluationEntry[] = [
		{ _id: '1', value: 5, category: 'A', timestamp: 1000 },
		{ _id: '2', value: 3, category: 'B', timestamp: 3000 },
		{ _id: '3', value: -2, category: 'C', timestamp: 2000 }
	];

	it('sorts descending by default (newest first)', () => {
		const result = sortEvaluations(evaluations, false);
		expect(result.map((e) => e._id)).toEqual(['2', '3', '1']);
	});

	it('sorts ascending when specified (oldest first)', () => {
		const result = sortEvaluations(evaluations, true);
		expect(result.map((e) => e._id)).toEqual(['1', '3', '2']);
	});

	it('does not mutate original array', () => {
		const original = [...evaluations];
		sortEvaluations(evaluations, false);
		expect(evaluations).toEqual(original);
	});

	it('returns new array instance', () => {
		const result = sortEvaluations(evaluations, false);
		expect(result).not.toBe(evaluations);
	});

	it('handles empty array', () => {
		const result = sortEvaluations([], false);
		expect(result).toEqual([]);
	});

	it('handles single element array', () => {
		const single = [{ _id: '1', value: 5, category: 'A', timestamp: 1000 }];
		const result = sortEvaluations(single, false);
		expect(result).toHaveLength(1);
	});
});

describe('matchesMultiSearch', () => {
	it('returns true for empty filter', () => {
		expect(matchesMultiSearch('', 'Any Value')).toBe(true);
	});

	it('returns true for whitespace-only filter', () => {
		expect(matchesMultiSearch('   ', 'Any Value')).toBe(true);
	});

	it('matches single term', () => {
		expect(matchesMultiSearch('Johnson', 'Ms. Johnson')).toBe(true);
	});

	it('matches case-insensitive', () => {
		expect(matchesMultiSearch('johnson', 'Ms. Johnson')).toBe(true);
	});

	it('matches partial string', () => {
		expect(matchesMultiSearch('John', 'Ms. Johnson')).toBe(true);
	});

	it('matches any term in comma-separated list', () => {
		expect(matchesMultiSearch('Smith, Johnson', 'Ms. Johnson')).toBe(true);
		expect(matchesMultiSearch('Smith, Johnson', 'Mr. Smith')).toBe(true);
	});

	it('handles comma-separated with spaces', () => {
		expect(matchesMultiSearch('Smith,  Johnson , Brown', 'Ms. Johnson')).toBe(true);
	});

	it('returns false when no terms match', () => {
		expect(matchesMultiSearch('Brown', 'Ms. Johnson')).toBe(false);
	});

	it('handles empty value string', () => {
		expect(matchesMultiSearch('test', '')).toBe(false);
	});

	it('handles both empty filter and value', () => {
		expect(matchesMultiSearch('', '')).toBe(true);
	});

	it('trims whitespace from search terms', () => {
		expect(matchesMultiSearch('  Johnson  ', 'Ms. Johnson')).toBe(true);
	});

	it('filters out empty terms from comma-separated list', () => {
		expect(matchesMultiSearch(',,Johnson,', 'Ms. Johnson')).toBe(true);
	});
});
