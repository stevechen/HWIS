// Weekly report labels.
//
// Evaluation weeks are Monday 00:00 – Sunday 23:59:59.999 in Asia/Taipei
// (fixed UTC+8, no DST) — see `evaluation_week.ts`. Convex runs in UTC, so these
// helpers must not read host-local calendar fields: doing so labelled a Taipei
// Monday as the preceding Sunday ("Oct 11 - Oct 15" instead of
// "Oct 12 - Oct 16").

import { TAIWAN_OFFSET_MS } from './evaluation_week';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ordinal week of the year (week 1 starts January 1, not ISO week 1), computed
 * from the Taipei wall-clock date so the result is identical on every host.
 */
export function getWeekNumber(timestamp: number): number {
	const date = new Date(timestamp + TAIWAN_OFFSET_MS);
	const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
	const diff = date.getTime() - startOfYear;
	const oneWeek = 604800000;
	return Math.floor(diff / oneWeek) + 1;
}

/** "Oct 12 - Oct 16, 2026" for the Taipei week starting at `mondayTimestamp`. */
export function formatDateRange(mondayTimestamp: number): string {
	const fridayTimestamp = mondayTimestamp + 4 * DAY_MS;

	const mondayStr = new Date(mondayTimestamp).toLocaleDateString('en-US', {
		month: 'short',
		day: '2-digit',
		timeZone: 'Asia/Taipei'
	});
	const fridayStr = new Date(fridayTimestamp).toLocaleDateString('en-US', {
		month: 'short',
		day: '2-digit',
		year: 'numeric',
		timeZone: 'Asia/Taipei'
	});

	return `${mondayStr} - ${fridayStr}`;
}

export function matchesMultiSearch(filter: string, value: string): boolean {
	if (!filter.trim()) return true;
	const searchTerms = filter
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	if (searchTerms.length === 0) return true;
	return searchTerms.some((term) => value.toLowerCase().includes(term));
}
