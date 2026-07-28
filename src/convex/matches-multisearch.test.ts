import { describe, expect, test } from 'vitest';
import { matchesMultiSearch } from './shared/evaluation_utils';

describe('matchesMultiSearch (canonical)', () => {
	test('case-insensitive matching works', () => {
		expect(matchesMultiSearch('creativity', 'Creativity')).toBe(true);
		expect(matchesMultiSearch('CREATIVITY', 'creativity')).toBe(true);
	});

	test('comma-separated multi-term matching', () => {
		expect(matchesMultiSearch('creativity,behavior', 'Great Creativity work')).toBe(true);
		expect(matchesMultiSearch('creativity,behavior', 'Bad Behavior incident')).toBe(true);
		expect(matchesMultiSearch('creativity,behavior', 'No match here')).toBe(false);
	});

	test('whitespace is trimmed', () => {
		expect(matchesMultiSearch(' creativity ', 'Creativity')).toBe(true);
		expect(matchesMultiSearch(' creativity , behavior ', 'Bad Behavior')).toBe(true);
	});

	test('empty filter matches everything', () => {
		expect(matchesMultiSearch('', 'anything')).toBe(true);
		expect(matchesMultiSearch('   ', 'anything')).toBe(true);
	});

	test('single exact match', () => {
		expect(matchesMultiSearch('academic', 'Academic Excellence')).toBe(true);
		expect(matchesMultiSearch('sports', 'Academic Excellence')).toBe(false);
	});

	test('student id partial matching works', () => {
		expect(matchesMultiSearch('7001', 'Student 7001001')).toBe(true);
	});
});
