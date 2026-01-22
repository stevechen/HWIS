import { describe, it, expect } from 'vitest';
import { cn } from '$lib/utils';

describe('cn (className utility)', () => {
	it('merges two class strings', () => {
		const result = cn('bg-red-500', 'text-white');
		expect(result).toBe('bg-red-500 text-white');
	});

	it('handles array of class strings', () => {
		const result = cn(['bg-red-500', 'text-white', 'p-4']);
		expect(result).toBe('bg-red-500 text-white p-4');
	});

	it('handles mixed inputs', () => {
		const result = cn('base-class', ['conditional-class'], 'another');
		expect(result).toContain('base-class');
		expect(result).toContain('conditional-class');
		expect(result).toContain('another');
	});

	it('handles conditional classes', () => {
		const isActive = true;
		const isDisabled = false;
		const result = cn('base', isActive && 'active', isDisabled && 'disabled');
		expect(result).toBe('base active');
	});

	it('handles undefined and null gracefully', () => {
		const result = cn('base', undefined, null, 'end');
		expect(result).toBe('base end');
	});

	it('handles empty strings', () => {
		const result = cn('', 'middle', '');
		expect(result).toBe('middle');
	});

	it('merges tailwind classes with conflicts (later wins)', () => {
		const result = cn('bg-red-500 bg-blue-500', 'p-4 p-2');
		expect(result).toContain('bg-blue-500');
		expect(result).toContain('p-2');
	});

	it('handles nested arrays', () => {
		const result = cn(['a', ['b', ['c']]]);
		expect(result).toBe('a b c');
	});
});
