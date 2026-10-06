<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		name,
		subtitle,
		active,
		initials,
		image = null,
		imageAlt = 'Avatar',
		testId,
		cardClass = '',
		titleSuffix,
		badges,
		corner,
		footer
	}: {
		name: string;
		subtitle?: string;
		active: boolean;
		initials: string;
		image?: string | null;
		imageAlt?: string;
		testId?: string;
		cardClass?: string;
		titleSuffix?: Snippet;
		badges?: Snippet;
		corner?: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<div
	class="bg-card relative flex flex-col rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md {cardClass}"
	data-testid={testId}
>
	<div class="flex items-start gap-3">
		<div class="relative shrink-0">
			{#if image}
				<img src={image} alt={imageAlt} class="size-12 rounded-xl object-cover" loading="lazy" />
			{:else}
				<div
					class="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl text-base font-semibold"
				>
					{initials}
				</div>
			{/if}
			{#if active}
				<span
					class="border-card absolute -right-1 -bottom-1 size-3.5 rounded-full border-2 bg-emerald-500"
					title="Active"
				></span>
			{:else}
				<span
					class="border-card absolute -right-1 -bottom-1 size-3.5 rounded-full border-2 bg-amber-500"
					title="Pending approval"
				></span>
			{/if}
		</div>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-semibold">
				{name}{#if titleSuffix}
					{@render titleSuffix()}{/if}
			</p>
			{#if subtitle}
				<p class="text-muted-foreground truncate text-xs">{subtitle}</p>
			{/if}
			{#if badges}
				<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
					{@render badges()}
				</div>
			{/if}
		</div>
		{#if corner}
			{@render corner()}
		{/if}
	</div>
	{#if footer}
		<div class="mt-4 border-t pt-3">
			{@render footer()}
		</div>
	{/if}
</div>
