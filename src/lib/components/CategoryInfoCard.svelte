<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Plus, Minus } from '@lucide/svelte';

	interface Category {
		_id: string;
		name: string;
		casAlignment?: ('Creativity' | 'Activity' | 'Service')[];
		meritCriteria?: string[];
		demeritCriteria?: string[];
	}

	let { category }: { category: Category } = $props();
</script>

<Card.Root class="mt-4">
	<Card.Header class="pb-2">
		<div class="flex justify-between items-center">
			<Card.Title class="text-base">{category.name}</Card.Title>
			{#if category.casAlignment && category.casAlignment.length > 0}
				<div class="flex gap-1">
					{#each category.casAlignment as alignment}
						<Badge variant="outline">{alignment}</Badge>
					{/each}
				</div>
			{/if}
		</div>
	</Card.Header>
	<Card.Content>
		<div class="gap-4 grid grid-cols-1 md:grid-cols-2">
			<!-- Demerit Column -->
			{#if category.demeritCriteria && category.demeritCriteria.length > 0}
				<div class="space-y-2">
					<h4 class="flex items-center gap-1 font-semibold text-red-600 text-sm">
						<Minus class="size-4" />
						Demerit (-)
					</h4>
					<ul class="space-y-1 pl-4 text-muted-foreground text-sm list-disc">
						{#each category.demeritCriteria as criterion}
							<li class="break-words">{criterion}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Merit Column -->
			{#if category.meritCriteria && category.meritCriteria.length > 0}
				<div class="space-y-2">
					<h4 class="flex items-center gap-1 font-semibold text-emerald-600 text-sm">
						<Plus class="size-4" />
						Merit (+)
					</h4>
					<ul class="space-y-1 pl-4 text-muted-foreground text-sm list-disc">
						{#each category.meritCriteria as criterion}
							<li class="break-words">{criterion}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</Card.Content>
</Card.Root>
