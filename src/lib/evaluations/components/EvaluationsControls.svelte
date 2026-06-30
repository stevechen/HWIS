<script lang="ts">
	import {
		ArrowUp,
		ArrowDown,
		ShieldUser,
		ShieldPlus,
		ListChevronsUpDown,
		ListChevronsDownUp
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		/** Current sort order */
		sortAscending?: boolean;
		/** Whether to show unenrolled students */
		showUnenrolled?: boolean;
		/** Whether to show details */
		showDetails?: boolean;
		/** Callback when sort order changes */
		onToggleSort?: () => void;
		/** Callback when show unenrolled toggles */
		onToggleShowUnenrolled?: () => void;
		/** Callback when show details toggles */
		onToggleShowDetails?: () => void;
		/** Optional title */
		title?: string;
		/** Additional controls/filter inputs */
		children?: import('svelte').Snippet;
		/** Additional toggle buttons (admin-only features) */
		extraToggles?: import('svelte').Snippet;
	}

	let {
		sortAscending = false,
		showUnenrolled = false,
		showDetails = false,
		onToggleSort,
		onToggleShowUnenrolled,
		onToggleShowDetails,
		title,
		children,
		extraToggles
	}: Props = $props();
</script>

<div
	class="from-background to-background/85 flex flex-col gap-4 border-b bg-linear-to-b py-2 sm:flex-row sm:items-center"
>
	<div class="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
		{#if title}
			<h2 class="text-xl font-semibold">{title}</h2>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			{#if children}
				{@render children()}
			{/if}
			<div class="flex items-center gap-2 sm:ms-auto">
				<Button
					aria-label={sortAscending ? 'Oldest First' : 'Newest First'}
					variant="outline"
					size="sm"
					onclick={onToggleSort}
					title={sortAscending ? 'Oldest First' : 'Newest First'}
				>
					{#if sortAscending}
						<ArrowUp class="size-4" />
					{:else}
						<ArrowDown class="size-4" />
					{/if}
				</Button>

				{#if onToggleShowUnenrolled}
					<Button
						aria-label={showUnenrolled ? 'Hide unenrolled students' : 'Show unenrolled students'}
						variant="outline"
						size="sm"
						onclick={onToggleShowUnenrolled}
						title={showUnenrolled ? 'Hide unenrolled students' : 'Show unenrolled students'}
					>
						{#if showUnenrolled}
							<ShieldUser class="size-4" />
						{:else}
							<ShieldPlus class="size-4" />
						{/if}
					</Button>
				{/if}

				{#if onToggleShowDetails}
					<Button
						aria-label={showDetails ? 'Hide Details' : 'Show Details'}
						variant="outline"
						size="sm"
						onclick={onToggleShowDetails}
						title={showDetails ? 'Hide Details' : 'Show Details'}
					>
						{#if showDetails}
							<ListChevronsUpDown class="size-4" />
						{:else}
							<ListChevronsDownUp class="size-4" />
						{/if}
					</Button>
				{/if}

				{#if extraToggles}
					{@render extraToggles()}
				{/if}
			</div>
		</div>
	</div>
</div>
