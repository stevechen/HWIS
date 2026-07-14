<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { X } from '@lucide/svelte';

	interface Action {
		label: string;
		action: () => void;
	}

	let {
		selectedCount,
		actions,
		onDone
	}: {
		selectedCount: number;
		actions: Action[];
		onDone: () => void;
	} = $props();
</script>

{#if selectedCount > 0}
	<div
		class="animate-slide-up fixed inset-x-0 bottom-0 z-50 border-t bg-white px-4 py-3 shadow-lg"
		role="toolbar"
		aria-label="Bulk actions"
	>
		<div class="mx-auto flex max-w-2xl items-center justify-between gap-4">
			<span class="text-sm font-medium">
				{selectedCount} student{selectedCount !== 1 ? 's' : ''} selected
			</span>
			<div class="flex flex-wrap items-center gap-1">
				{#if actions.length > 0}
					<span class="text-muted-foreground mr-1 text-xs">Move to:</span>
				{/if}
				{#each actions as act (act.label)}
					<Button size="sm" onclick={act.action}>{act.label}</Button>
				{/each}
				<Button variant="ghost" size="icon" onclick={onDone} aria-label="Done selecting">
					<X class="size-4" />
				</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes slide-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	.animate-slide-up {
		animation: slide-up 0.2s ease-out;
	}
</style>
