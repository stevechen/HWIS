import type { Id } from '../_generated/dataModel';

/**
 * Shared contract for the Recent Actions multi-edit feature. The Convex query
 * `evaluations.listRecentBatches` returns batches of this shape; the Svelte
 * panel and dialogs consume the same types.
 */
export type RecentBatchEvaluation = {
	id: Id<'evaluations'>;
	studentId: Id<'students'>;
	englishName: string;
	className?: string;
	value: number;
	categoryId: Id<'point_categories'>;
	category: string;
	details: string;
	timestamp: number;
};

export type RecentBatch = {
	batchId: string;
	createdAt: number;
	evaluations: RecentBatchEvaluation[];
};

/**
 * Fallback grouping key for evaluations created before the `batchId` column
 * existed. Two rows grouped by this key are treated as "the same batch", so
 * the key only includes fields that one create call stamps identically
 * (teacher is implicit: the query is teacher-scoped).
 */
export function derivedBatchKey(eval_: {
	timestamp: number;
	value: number;
	categoryId: Id<'point_categories'>;
	details: string;
	semesterId: string;
}): string {
	return [eval_.timestamp, eval_.value, eval_.categoryId, eval_.details, eval_.semesterId].join(
		'|'
	);
}
