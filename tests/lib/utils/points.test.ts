import { describe, it, expect } from 'vite-plus/test';
import { POINTS_MULTIPLIER, toDisplayPoints, fromDisplayPoints } from '$lib/utils';

describe('points display helpers', () => {
	it('multiplies canonical values by 10 for display', () => {
		expect(POINTS_MULTIPLIER).toBe(10);
		expect(toDisplayPoints(1)).toBe(10);
		expect(toDisplayPoints(-2)).toBe(-20);
		expect(toDisplayPoints(0)).toBe(0);
		expect(toDisplayPoints(2431)).toBe(24310);
	});

	it('divides display values by 10 for storage', () => {
		expect(fromDisplayPoints(10)).toBe(1);
		expect(fromDisplayPoints(-20)).toBe(-2);
		expect(fromDisplayPoints(0)).toBe(0);
	});

	it('round-trips integer point values exactly', () => {
		for (const value of [-2, -1, 0, 1, 2, 15, 2431]) {
			expect(fromDisplayPoints(toDisplayPoints(value))).toBe(value);
			expect(toDisplayPoints(fromDisplayPoints(toDisplayPoints(value)))).toBe(
				toDisplayPoints(value)
			);
		}
	});

	it('round-trips fractional house-event values without float noise', () => {
		// Type 5.3 in the 10× house-events input → 0.53 canonical → 5.3 on render.
		expect(fromDisplayPoints(5.3)).toBe(0.53);
		expect(toDisplayPoints(0.53)).toBe(5.3);
		expect(toDisplayPoints(0.09)).toBe(0.9);
		expect(toDisplayPoints(0.555)).toBe(5.55);
		expect(toDisplayPoints(1.25)).toBe(12.5);
	});
});
