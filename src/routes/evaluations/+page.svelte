<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Calendar, User, Tag, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Card from '$lib/components/ui/card';

	const evaluations = useQuery(api.evaluations.listRecent, { limit: 50 });

	function formatDate(ts: number) {
		return (
			new Date(ts).toLocaleDateString() +
			' ' +
			new Date(ts).toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit'
			})
		);
	}
</script>

<div class="mx-auto max-w-3xl p-8">
	<header class="mb-8 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="outline" onclick={() => goto('/')}>← Back</Button>
			<h1 class="text-foreground text-2xl font-semibold">Evaluation History</h1>
		</div>
		<div class="flex items-center gap-2">
			<ThemeToggle />
			<Button onclick={() => goto('/evaluations/new')}>
				<Plus class="mr-2 h-4 w-4" />
				New Evaluation
			</Button>
		</div>
	</header>

	{#if evaluations.isLoading}
		<div class="text-muted-foreground py-16 text-center">Loading history...</div>
	{:else if evaluations.data?.length === 0}
		<Card.Root class="p-8 text-center">
			<Card.Content class="pt-6">
				<p class="text-muted-foreground mb-6">
					No evaluations found. Start by awarding some points!
				</p>
				<Button onclick={() => goto('/evaluations/new')}>Give Points</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="flex flex-col gap-4">
			{#each evaluations.data || [] as eval_}
				<Card.Root>
					<Card.Content class="p-5">
						<div class="mb-4 flex items-start justify-between">
							<div class="flex items-center gap-2 text-lg font-semibold">
								<User class="h-4 w-4" />
								<span>{eval_.studentName}</span>
								<span
									class="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-normal"
									>{eval_.studentIdCode}</span
								>
							</div>
							<div
								class="rounded-md px-3 py-1 text-lg font-bold"
								class:bg-emerald-50={eval_.value >= 0}
								class:text-emerald-600={eval_.value >= 0}
								class:bg-red-50={eval_.value < 0}
								class:text-red-600={eval_.value < 0}
							>
								{eval_.value > 0 ? '+' : ''}{eval_.value}
							</div>
						</div>

						<div class="text-muted-foreground mb-4 flex gap-6 text-sm">
							<div class="flex items-center gap-1.5">
								<Tag class="h-3.5 w-3.5" />
								<span>{eval_.category} › {eval_.subCategory}</span>
							</div>
							<div class="flex items-center gap-1.5">
								<Calendar class="h-3.5 w-3.5" />
								<span>{formatDate(eval_.timestamp)}</span>
							</div>
						</div>

						{#if eval_.details}
							<div class="bg-muted border-border rounded-md border-l-3 p-3 text-sm">
								{eval_.details}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
