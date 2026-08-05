<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Plus, Minus } from '@lucide/svelte';

	interface Category {
		name: string;
		casAlignment?: ('Creativity' | 'Activity' | 'Service')[];
		meritCriteria?: string[];
		demeritCriteria?: string[];
	}

	let {
		category,
		oncriterionclick,
		placeholder = false
	}: {
		category?: Category;
		oncriterionclick?: (criterion: string) => void;
		placeholder?: boolean;
	} = $props();
</script>

<Card.Root class="mt-4">
	<Card.Header class="pb-2">
		<div class="flex items-center justify-between">
			{#if category}
				<Card.Title class="text-base">{category.name}</Card.Title>
			{:else if placeholder}
				<div class="bg-muted h-5 w-40 animate-pulse rounded"></div>
			{/if}
			{#if category?.casAlignment && category.casAlignment.length > 0}
				<div class="flex gap-1">
					{#each category.casAlignment as alignment (alignment)}
						<Badge variant="outline">{alignment}</Badge>
					{/each}
				</div>
			{:else if placeholder}
				<div class="flex gap-1">
					<div class="bg-muted size-6 animate-pulse rounded-full"></div>
					<div class="bg-muted size-6 animate-pulse rounded-full"></div>
				</div>
			{/if}
		</div>
	</Card.Header>
	<Card.Content>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<!-- Demerit Column -->
			{#if placeholder || (category?.demeritCriteria && category.demeritCriteria.length > 0)}
				<div class="space-y-2">
					<h4 class="flex items-center gap-1 text-sm font-semibold text-red-600">
						<Minus class="size-4" />
						Demerit (-)
					</h4>
					{#if category?.demeritCriteria && category.demeritCriteria.length > 0}
						<ul class="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
							{#each category.demeritCriteria as criterion (criterion)}
								<li class="break-words">
									{#if oncriterionclick}
										<span
											role="button"
											tabindex="0"
											class="cursor-pointer hover:underline"
											onclick={() => oncriterionclick(criterion)}
											onkeydown={(e) => e.key === 'Enter' && oncriterionclick(criterion)}
											>{criterion}</span
										>
									{:else}
										{criterion}
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<div class="space-y-2">
							<div class="bg-muted h-4 w-full animate-pulse rounded"></div>
							<div class="bg-muted h-4 w-4/5 animate-pulse rounded"></div>
							<div class="bg-muted h-4 w-3/5 animate-pulse rounded"></div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Merit Column -->
			{#if placeholder || (category?.meritCriteria && category.meritCriteria.length > 0)}
				<div class="space-y-2">
					<h4 class="flex items-center gap-1 text-sm font-semibold text-emerald-600">
						<Plus class="size-4" />
						Merit (+)
					</h4>
					{#if category?.meritCriteria && category.meritCriteria.length > 0}
						<ul class="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
							{#each category.meritCriteria as criterion (criterion)}
								<li class="break-words">
									{#if oncriterionclick}
										<span
											role="button"
											tabindex="0"
											class="cursor-pointer hover:underline"
											onclick={() => oncriterionclick(criterion)}
											onkeydown={(e) => e.key === 'Enter' && oncriterionclick(criterion)}
											>{criterion}</span
										>
									{:else}
										{criterion}
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<div class="space-y-2">
							<div class="bg-muted h-4 w-full animate-pulse rounded"></div>
							<div class="bg-muted h-4 w-4/5 animate-pulse rounded"></div>
							<div class="bg-muted h-4 w-3/5 animate-pulse rounded"></div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</Card.Content>
</Card.Root>
