<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { X } from '@lucide/svelte';

	interface Target {
		label: string;
		action: () => void;
		color?: string;
	}

	let {
		open,
		onClose,
		title,
		subtitle,
		targets
	}: {
		open: boolean;
		onClose: () => void;
		title: string;
		subtitle?: string;
		targets: Target[];
	} = $props();
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 md:relative md:inset-auto md:max-w-full md:overflow-hidden"
		role="dialog"
		aria-modal="true"
		aria-labelledby="move-dialog-title"
	>
		<div class="fixed inset-0 bg-black/50 md:hidden" onclick={onClose} aria-hidden="true"></div>
		<div
			class="animate-slide-up fixed inset-x-0 bottom-0 z-50 border-t bg-white px-4 py-3 shadow-lg md:fixed md:inset-auto md:top-1/2 md:left-1/2 md:w-full md:max-w-sm md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border md:border-none md:bg-white md:p-4 md:shadow-xl"
		>
			<div class="mx-auto flex max-w-2xl flex-col gap-3">
				<h3 id="move-dialog-title" class="text-sm font-medium">{title}</h3>
				{#if subtitle}
					<p class="text-muted-foreground text-sm">{subtitle}</p>
				{/if}
				<div class="flex flex-col gap-2">
					{#each targets as target (target.label)}
						<Button
							size="sm"
							onclick={target.action}
							variant="outline"
							class={`w-full justify-start ${target.color ?? ''}`}
						>
							{target.label}
						</Button>
					{/each}
				</div>
				<Button
					variant="outline"
					class="w-full justify-start"
					size="sm"
					onclick={onClose}
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
