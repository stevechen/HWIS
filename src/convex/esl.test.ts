import { describe, it, expect } from 'vitest';
import { eslClassShortLabel, type EslClassType } from './shared/esl';

describe('shared/esl - eslClassShortLabel', () => {
	// Before/after table for G7–G10 (documented before implementation)
	// Input format: { grade, level, classNumber, type }
	// G7–G9: G<grade> <short-level> <class-number> (e.g., G7 Pre. 1, G8 Ele. 3, G9 Bas. 3)
	// No trailing grade token duplication (never G9 Bas. 3 G9)
	// G10: H1nnA/B verbatim (e.g., H101A, H112B, H110A)

	describe('G7–G9 levelled grades', () => {
		const testCases: Array<{
			grade: 7 | 8 | 9;
			level: string;
			classNumber: string;
			type: EslClassType;
			expected: string;
		}> = [
			// Pre-Ele
			{ grade: 7, level: 'Pre-Ele', classNumber: '1', type: 'CLIL', expected: 'G7 Pre. 1' },
			{ grade: 7, level: 'Pre-Ele', classNumber: '2', type: 'Comm', expected: 'G7 Pre. 2' },
			{ grade: 8, level: 'Pre-Ele', classNumber: '1', type: 'CLIL', expected: 'G8 Pre. 1' },
			{ grade: 9, level: 'Pre-Ele', classNumber: '2', type: 'G9', expected: 'G9 Pre. 2' },

			// Elementary
			{ grade: 7, level: 'Elementary', classNumber: '1', type: 'CLIL', expected: 'G7 Ele. 1' },
			{ grade: 7, level: 'Elementary', classNumber: '2', type: 'Comm', expected: 'G7 Ele. 2' },
			{ grade: 8, level: 'Elementary', classNumber: '1', type: 'CLIL', expected: 'G8 Ele. 1' },
			{ grade: 8, level: 'Elementary', classNumber: '2', type: 'Comm', expected: 'G8 Ele. 2' },
			{ grade: 9, level: 'Elementary', classNumber: '1', type: 'G9', expected: 'G9 Ele. 1' },

			// Basic
			{ grade: 7, level: 'Basic', classNumber: '1', type: 'CLIL', expected: 'G7 Bas. 1' },
			{ grade: 7, level: 'Basic', classNumber: '2', type: 'Comm', expected: 'G7 Bas. 2' },
			{ grade: 8, level: 'Basic', classNumber: '1', type: 'CLIL', expected: 'G8 Bas. 1' },
			{ grade: 8, level: 'Basic', classNumber: '2', type: 'Comm', expected: 'G8 Bas. 2' },
			{ grade: 9, level: 'Basic', classNumber: '1', type: 'G9', expected: 'G9 Bas. 1' },
			{ grade: 9, level: 'Basic', classNumber: '2', type: 'G9', expected: 'G9 Bas. 2' },
			{ grade: 9, level: 'Basic', classNumber: '3', type: 'G9', expected: 'G9 Bas. 3' },

			// Intermediate
			{ grade: 7, level: 'Intermediate', classNumber: '1', type: 'CLIL', expected: 'G7 Int. 1' },
			{ grade: 8, level: 'Intermediate', classNumber: '2', type: 'Comm', expected: 'G8 Int. 2' },
			{ grade: 9, level: 'Intermediate', classNumber: '1', type: 'G9', expected: 'G9 Int. 1' },

			// Advanced
			{ grade: 7, level: 'Advanced', classNumber: '1', type: 'CLIL', expected: 'G7 Adv. 1' },
			{ grade: 8, level: 'Advanced', classNumber: '2', type: 'Comm', expected: 'G8 Adv. 2' },
			{ grade: 9, level: 'Advanced', classNumber: '1', type: 'G9', expected: 'G9 Adv. 1' }
		];

		for (const tc of testCases) {
			it(`returns "${tc.expected}" for G${tc.grade} ${tc.level} ${tc.classNumber} (${tc.type})`, () => {
				const result = eslClassShortLabel({
					grade: tc.grade,
					level: tc.level,
					classNumber: tc.classNumber,
					type: tc.type
				});
				expect(result).toBe(tc.expected);
			});
		}

		it('never duplicates grade token (no trailing G9)', () => {
			const result = eslClassShortLabel({
				grade: 9,
				level: 'Basic',
				classNumber: '3',
				type: 'G9'
			});
			expect(result).toBe('G9 Bas. 3');
			expect(result).not.toContain('G9 Bas. 3 G9');
			expect(result.split(' ').filter((t) => t === 'G9').length).toBe(1);
		});
	});

	describe('G10 (non-levelled)', () => {
		const testCases: Array<{
			grade: 10;
			level: 'A' | 'B';
			classNumber: string;
			type: 'H10A' | 'H10B';
			expected: string;
		}> = [
			{ grade: 10, level: 'A', classNumber: '01', type: 'H10A', expected: 'H101A' },
			{ grade: 10, level: 'B', classNumber: '01', type: 'H10B', expected: 'H101B' },
			{ grade: 10, level: 'A', classNumber: '02', type: 'H10A', expected: 'H102A' },
			{ grade: 10, level: 'B', classNumber: '02', type: 'H10B', expected: 'H102B' },
			{ grade: 10, level: 'A', classNumber: '10', type: 'H10A', expected: 'H110A' },
			{ grade: 10, level: 'B', classNumber: '10', type: 'H10B', expected: 'H110B' },
			{ grade: 10, level: 'A', classNumber: '11', type: 'H10A', expected: 'H111A' },
			{ grade: 10, level: 'B', classNumber: '12', type: 'H10B', expected: 'H112B' }
		];

		for (const tc of testCases) {
			it(`returns "${tc.expected}" for G10 H1${tc.classNumber}${tc.level}`, () => {
				const result = eslClassShortLabel({
					grade: tc.grade,
					level: tc.level,
					classNumber: tc.classNumber,
					type: tc.type
				});
				expect(result).toBe(tc.expected);
			});
		}

		it('returns verbatim H1nnA/B format without extra spaces or tokens', () => {
			const result = eslClassShortLabel({
				grade: 10,
				level: 'A',
				classNumber: '05',
				type: 'H10A'
			});
			expect(result).toBe('H105A');
			expect(result).toMatch(/^H1\d{2}[AB]$/);
		});
	});

	describe('edge cases', () => {
		it('handles missing level for G7–G9 gracefully', () => {
			const result = eslClassShortLabel({
				grade: 7,
				classNumber: '1',
				type: 'CLIL'
			});
			expect(result).toBe('G7 1');
		});

		it('handles missing level for G10 gracefully', () => {
			const result = eslClassShortLabel({
				grade: 10,
				classNumber: '01',
				type: 'H10A'
			});
			expect(result).toBe('H101A');
		});
	});
});
