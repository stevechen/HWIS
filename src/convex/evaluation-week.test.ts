import { describe, expect, test } from 'vitest';
import {
	WEEK_MS,
	weekStartOf,
	weekEndOf,
	lockCutoffFor,
	isEditable
} from './shared/evaluation_week';

// Week boundaries are defined in Taiwan time (UTC+8, no DST). Expected values
// are written as explicit +08:00 instants so these assertions hold regardless
// of the host process timezone. June 2026: Monday 8th, Wednesday 10th,
// Sunday 14th, Monday 15th.
const MON = new Date('2026-06-08T00:00:00+08:00').getTime();
const WED = new Date('2026-06-10T12:00:00+08:00').getTime();
const SUN_END = new Date('2026-06-14T23:59:59.999+08:00').getTime();
const NEXT_MON = new Date('2026-06-15T00:00:00+08:00').getTime();

describe('evaluation week policy', () => {
	describe('weekStartOf (week containing timestamp)', () => {
		test('returns itself for Monday 00:00', () => {
			expect(weekStartOf(MON)).toBe(MON);
		});

		test('returns the same Monday for any point inside the week', () => {
			expect(weekStartOf(new Date('2026-06-08T23:59:59.999+08:00').getTime())).toBe(MON);
			expect(weekStartOf(WED)).toBe(MON);
			expect(weekStartOf(SUN_END)).toBe(MON);
		});

		test('rolls to the next Monday at the week boundary', () => {
			expect(weekStartOf(NEXT_MON)).toBe(NEXT_MON);
			expect(weekStartOf(new Date('2026-06-15T00:00:00.001+08:00').getTime())).toBe(NEXT_MON);
		});
	});

	describe('weekEndOf (Sunday 23:59:59.999 of the week)', () => {
		test('is the last millisecond of the week containing the timestamp', () => {
			expect(weekEndOf(MON)).toBe(MON + WEEK_MS - 1);
			expect(weekEndOf(WED)).toBe(SUN_END);
		});
	});

	describe('lockCutoffFor (Monday 00:00 after the week)', () => {
		test('is exactly one week after the week start', () => {
			expect(lockCutoffFor(MON)).toBe(NEXT_MON);
			expect(lockCutoffFor(WED)).toBe(NEXT_MON);
			expect(lockCutoffFor(SUN_END)).toBe(NEXT_MON);
		});
	});

	describe('Taiwan-time anchoring', () => {
		test('follows the Taiwan calendar, not the host timezone', () => {
			// Sunday 20:00 UTC is Monday 04:00 in Taiwan. A UTC host sees this as
			// the tail of the June 8 week; Taiwan sees Monday June 15, so the
			// week must be June 15 regardless of host.
			const sundayUtc = new Date('2026-06-14T20:00:00Z').getTime();
			expect(weekStartOf(sundayUtc)).toBe(NEXT_MON);
			expect(lockCutoffFor(sundayUtc)).toBe(new Date('2026-06-22T00:00:00+08:00').getTime());
			expect(weekEndOf(sundayUtc)).toBe(new Date('2026-06-21T23:59:59.999+08:00').getTime());
		});

		test('crosses what would be a DST transition on other calendars unchanged', () => {
			// In DST-observing timezones March 2026 contains the spring-forward;
			// Taiwan has no DST, so the cutoff must still land on Monday 00:00.
			const springForwardSunday = new Date('2026-03-08T12:00:00+08:00').getTime();
			expect(lockCutoffFor(springForwardSunday)).toBe(
				new Date('2026-03-09T00:00:00+08:00').getTime()
			);
			expect(weekEndOf(springForwardSunday)).toBe(
				new Date('2026-03-08T23:59:59.999+08:00').getTime()
			);
		});
	});

	describe('isEditable', () => {
		test('is true before the lock cutoff, inclusive of the last millisecond', () => {
			expect(isEditable(WED, NEXT_MON - 1)).toBe(true);
		});

		test('is false at and after the lock cutoff', () => {
			expect(isEditable(WED, NEXT_MON)).toBe(false);
			expect(isEditable(WED, NEXT_MON + 1)).toBe(false);
		});

		test('defaults to now for an evaluation created just now', () => {
			const now = Date.now();
			expect(isEditable(now)).toBe(true);
			expect(isEditable(now - 30 * 24 * 60 * 60 * 1000)).toBe(false);
		});
	});
});
