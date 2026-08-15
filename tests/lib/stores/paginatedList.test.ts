import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { createPaginatedList, type PaginatedPage } from '$lib/stores/paginatedList.svelte';
import PaginatedListHarness from './paginatedList.harness.svelte';

type Item = { _id: string; name: string };

const page1: PaginatedPage<Item> = {
	page: [
		{ _id: 'a', name: 'Alice' },
		{ _id: 'b', name: 'Bob' }
	],
	isDone: false,
	continueCursor: '2'
};

const page2: PaginatedPage<Item> = {
	page: [
		{ _id: 'b', name: 'Bob' },
		{ _id: 'c', name: 'Carol' }
	],
	isDone: true,
	continueCursor: null
};

describe('createPaginatedList', () => {
	it('starts empty with no cursor and not done', () => {
		const list = createPaginatedList<Item>();
		expect(list.items).toEqual([]);
		expect(list.cursor).toBeNull();
		expect(list.isDone).toBe(false);
		expect(list.isLoadingMore).toBe(false);
	});

	it('replaces items on the first page', () => {
		const list = createPaginatedList<Item>();
		list.accept(page1);
		expect(list.items.map((i) => i._id)).toEqual(['a', 'b']);
		expect(list.isDone).toBe(false);
	});

	it('appends the next page after load-more, deduped by _id', () => {
		const list = createPaginatedList<Item>();
		list.accept(page1);
		list.loadMore();
		expect(list.cursor).toBe('2');
		expect(list.isLoadingMore).toBe(true);
		list.accept(page2);
		expect(list.items.map((i) => i._id)).toEqual(['a', 'b', 'c']);
		expect(list.isDone).toBe(true);
		expect(list.isLoadingMore).toBe(false);
	});

	it('does not advance past the last page', () => {
		const list = createPaginatedList<Item>();
		list.accept(page1);
		list.loadMore(); // cursor -> '2'
		list.accept(page2); // isDone -> true
		list.loadMore();
		expect(list.cursor).toBe('2'); // unchanged
		expect(list.items.map((i) => i._id)).toEqual(['a', 'b', 'c']);
	});

	it('does not advance when no continue cursor is known yet', () => {
		const list = createPaginatedList<Item>();
		list.loadMore();
		expect(list.cursor).toBeNull();
		expect(list.isLoadingMore).toBe(false);
	});

	it('does not advance while already loading more', () => {
		const list = createPaginatedList<Item>();
		list.accept(page1);
		list.loadMore();
		const cursorAfterFirst = list.cursor;
		list.loadMore();
		expect(list.cursor).toBe(cursorAfterFirst);
	});

	it('does not leak internal state dependencies to a calling $effect', async () => {
		const list = createPaginatedList<Item>();
		list.accept(page1);

		// Render a page-like component whose `$effect` calls accept(data). The effect
		// must depend only on `data`, not on the store's cursor — otherwise a cursor
		// advance re-fires accept with stale data and clears `isLoadingMore` mid-fetch
		// (spinner vanishes, double-fires).
		const harness = render(PaginatedListHarness, { props: { list, data: page1 } });
		await tick();
		expect(list.items.map((i) => i._id)).toEqual(['a', 'b']);

		list.loadMore();
		await tick();
		expect(list.items.map((i) => i._id)).toEqual(['a', 'b']); // not re-accepted with stale data
		expect(list.isLoadingMore).toBe(true); // spinner stays up until new data

		await harness.rerender({ data: page2 });
		expect(list.items.map((i) => i._id)).toEqual(['a', 'b', 'c']);
		expect(list.isLoadingMore).toBe(false);
	});

	it('ignores empty or undefined results', () => {
		const list = createPaginatedList<Item>();
		list.accept(undefined);
		list.accept(null);
		expect(list.items).toEqual([]);
	});

	it('resets to the first page when the key changes', () => {
		const list = createPaginatedList<Item>();
		list.accept(page1);
		list.loadMore();
		list.accept(page2);

		list.reset('filters-v2');
		expect(list.items).toEqual([]);
		expect(list.cursor).toBeNull();
		expect(list.isDone).toBe(false);
		expect(list.isLoadingMore).toBe(false);

		list.accept(page1);
		expect(list.items.map((i) => i._id)).toEqual(['a', 'b']);
	});

	it('ignores a reset with the same key', () => {
		const list = createPaginatedList<Item>();
		list.accept(page1);
		list.reset('key');
		expect(list.items).toEqual([]);
		list.accept(page1);
		list.reset('key'); // same key — must not wipe again
		expect(list.items.map((i) => i._id)).toEqual(['a', 'b']);
	});

	describe('IntersectionObserver', () => {
		class FakeIntersectionObserver {
			static instances: FakeIntersectionObserver[] = [];
			callback: IntersectionObserverCallback;
			observed: Element[] = [];
			disconnected = false;

			constructor(callback: IntersectionObserverCallback) {
				this.callback = callback;
				FakeIntersectionObserver.instances.push(this);
			}

			observe(target: Element) {
				this.observed.push(target);
			}

			disconnect() {
				this.disconnected = true;
				this.observed = [];
			}

			unobserve() {}

			takeRecords() {
				return [];
			}

			trigger(intersecting: boolean) {
				this.callback(
					[{ isIntersecting: intersecting } as IntersectionObserverEntry],
					this as unknown as IntersectionObserver
				);
			}
		}

		beforeEach(() => {
			vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
			FakeIntersectionObserver.instances = [];
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('loads the next page when the sentinel scrolls into view', async () => {
			const list = createPaginatedList<Item>();
			list.accept(page1);
			const sentinel = document.createElement('div');
			list.bindSentinel(sentinel);
			await tick();

			expect(FakeIntersectionObserver.instances).toHaveLength(1);
			expect(FakeIntersectionObserver.instances[0].observed).toContain(sentinel);

			FakeIntersectionObserver.instances[0].trigger(true);
			expect(list.cursor).toBe('2');
			expect(list.isLoadingMore).toBe(true);
		});

		it('does not load more when the list is done', async () => {
			const list = createPaginatedList<Item>();
			list.accept(page2); // isDone true
			const sentinel = document.createElement('div');
			list.bindSentinel(sentinel);
			await tick();

			FakeIntersectionObserver.instances[0].trigger(true);
			expect(list.cursor).toBeNull();
		});

		it('re-observes a replacement sentinel', async () => {
			const list = createPaginatedList<Item>();
			list.accept(page1);
			const first = document.createElement('div');
			const second = document.createElement('div');
			list.bindSentinel(first);
			await tick();
			list.bindSentinel(second);
			await tick();

			expect(FakeIntersectionObserver.instances[0].observed).toContain(second);
		});

		it('disconnects the observer on destroy', async () => {
			const list = createPaginatedList<Item>();
			list.accept(page1);
			list.bindSentinel(document.createElement('div'));
			await tick();
			list.destroy();
			expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true);
		});
	});
});
