import { untrack } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

export type PaginatedPage<T> = {
	page: T[];
	isDone: boolean;
	continueCursor: string | null;
};

/**
 * Owns the paginated-list state machine: cursor, accumulation with dedupe,
 * reset-on-filter-change, and the infinite-scroll IntersectionObserver.
 *
 * The page keeps its `useQuery` (convex-svelte requires top-level calls) and
 * feeds each page through {@link accept}; this module owns everything between
 * "query returned a page" and "the list shows N accumulated rows". The page
 * re-binds the sentinel from its own `$effect` so reactivity stays in the
 * component; this module stays testable outside one.
 */
export function createPaginatedList<T extends { _id: string }>(rootMargin = '200px') {
	let items = $state<T[]>([]);
	let isDone = $state(false);
	let isLoadingMore = $state(false);
	let cursor = $state<string | null>(null);

	let currentKey = '';
	let lastContinueCursor: string | null = null;
	let observer: IntersectionObserver | null = null;

	/** Call from an `$effect` with the current query key: wipes pagination when it changes. */
	function reset(key: string) {
		untrack(() => {
			if (key === currentKey) return;
			currentKey = key;
			cursor = null;
			items = [];
			isDone = false;
			isLoadingMore = false;
			lastContinueCursor = null;
		});
	}

	/**
	 * Feed each query page. Replaces on the first page, appends (deduped by `_id`) after.
	 *
	 * All internal `$state` reads are untracked: a page `$effect` calling this would
	 * otherwise depend on `cursor` and re-fire on cursor advance with stale data,
	 * wiping `isLoadingMore` mid-fetch. Reads happen in the same flush they were
	 * written by {@link loadMore}, so untracking loses nothing.
	 */
	function accept(result: PaginatedPage<T> | undefined | null) {
		if (!result) return;
		untrack(() => {
			if (cursor === null) {
				items = result.page;
			} else {
				const existingIds = new SvelteSet(items.map((item) => item._id));
				items = [...items, ...result.page.filter((item) => !existingIds.has(item._id))];
			}
			isDone = result.isDone;
			isLoadingMore = false;
			lastContinueCursor = result.continueCursor;
		});
	}

	/** Advance to the next page, guarded so it never double-fires or overruns. */
	function loadMore() {
		if (isDone || isLoadingMore) return;
		if (!lastContinueCursor) return;
		cursor = lastContinueCursor;
		isLoadingMore = true;
	}

	/**
	 * Bind (or unbind) the infinite-scroll sentinel. The store owns the
	 * IntersectionObserver; call again with a new element to re-aim it.
	 */
	function bindSentinel(el: HTMLElement | null) {
		observer?.disconnect();
		if (!el) return;
		observer ??= new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadMore();
			},
			{ rootMargin }
		);
		observer.observe(el);
	}

	/** Disconnect the observer — call from `onDestroy`. */
	function destroy() {
		observer?.disconnect();
		observer = null;
	}

	return {
		get items() {
			return items;
		},
		get isDone() {
			return isDone;
		},
		get isLoadingMore() {
			return isLoadingMore;
		},
		get cursor() {
			return cursor;
		},
		reset,
		accept,
		loadMore,
		bindSentinel,
		destroy
	};
}
