<script lang="ts">
	import type { PaginatedPage } from '$lib/stores/paginatedList.svelte';

	interface Item {
		_id: string;
		name: string;
	}

	interface ListLike {
		accept(result: PaginatedPage<Item> | undefined | null): void;
	}

	let { list, data }: { list: ListLike; data: PaginatedPage<Item> | undefined } = $props();

	$effect(() => {
		list.accept(data);
	});
</script>
