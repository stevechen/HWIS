import type { RecentBatch } from '$convex/shared/recentActions';

/**
 * Display helpers for the Recent Actions panel. All decision logic (lock,
 * mixed detection) stays client-side here so the Convex query stays a dumb,
 * cache-friendly grouping.
 */
export function isMixedBatch(batch: RecentBatch): boolean {
	const first = batch.evaluations[0];
	if (!first) return false;
	return batch.evaluations.some(
		(e) => e.value !== first.value || e.categoryId !== first.categoryId
	);
}

export function batchValueDisplay(batch: RecentBatch): {
	mixed: boolean;
	value: number;
	category: string;
} {
	return {
		mixed: isMixedBatch(batch),
		value: batch.evaluations[0]?.value ?? 0,
		category: batch.evaluations[0]?.category ?? ''
	};
}

export function valueChipClass(value: number): string {
	return value > 0
		? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
		: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
}

export function mixedChipClass(): string {
	return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
}

export function formatBatchTime(timestamp: number): string {
	return new Date(timestamp).toLocaleString('en-US', {
		weekday: 'short',
		hour: 'numeric',
		minute: '2-digit'
	});
}
