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
		<div class="mx-auto flex max-w-2xl flex-col gap-3">
			{#if actions.length > 0}
				<span class="text-sm font-medium"
					>Move {selectedCount} student{selectedCount !== 1 ? 's' : ''} to:</span
				>
			{/if}
			<div class="flex flex-col gap-2">
				{#each actions as act (act.label)}
					<Button class="w-full justify-start" size="sm" variant="default" onclick={act.action}
						>{act.label}</Button
					>
				{/each}
				<Button
					variant="outline"
					class="w-full justify-start"
					size="sm"
					onclick={onDone}
					aria-label="Cancel"
				>
					<X class="mr-2 size-4" />Cancel
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
