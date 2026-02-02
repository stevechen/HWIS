<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Calendar, User, Tag, Plus, ArrowLeft } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Card from '$lib/components/ui/card';

	let { data }: { data: { testRole?: string } } = $props();

	const isTestMode = $derived(!!data.testRole);

	// Fetch user to check role (for both test mode and real mode)
	const user = useQuery(api.users.viewer, () => ({
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));

	const isAdmin = $derived.by(() => {
		// Check test mode first
		if (data.testRole === 'admin' || data.testRole === 'super') {
			return true;
		}
		// Check real mode from database
		if (!user.isLoading && user.data?.role) {
			return user.data.role === 'admin' || user.data.role === 'super';
		}
		return false;
	});

	const evaluations = useQuery(api.evaluations.listRecent, () => ({
		limit: 50,
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));

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

<div class="mx-auto p-8 max-w-3xl">
	<header class="flex justify-between items-center mb-8">
		<div class="flex items-center gap-4">
			{#if isAdmin}
				<Button variant="outline" onclick={() => void goto('/admin')}>
					<ArrowLeft class="mr-2 w-4 h-4" />
					Back to Admin
				</Button>
			{/if}
			<h1 class="font-semibold text-foreground text-2xl">Evaluation History</h1>
		</div>
		<div class="flex items-center gap-2">
			<ThemeToggle />
			<Button onclick={() => void goto('/evaluations/new')}>
				<Plus class="mr-2 w-4 h-4" />
				New Evaluation
			</Button>
		</div>
	</header>

	{#if evaluations.isLoading}
		<div class="py-16 text-muted-foreground text-center">Loading history...</div>
	{:else if evaluations.data?.length === 0}
		<Card.Root class="p-8 text-center">
			<Card.Content class="pt-6">
				<p class="mb-6 text-muted-foreground">
					No evaluations found. Start by awarding some points!
				</p>
				<Button onclick={() => void goto('/evaluations/new')}>Give Points</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="flex flex-col gap-4">
			{#each evaluations.data || [] as eval_ (eval_._id)}
				<Card.Root>
					<Card.Content class="p-5">
						<div class="flex justify-between items-start mb-4">
							<div class="flex items-center gap-2 font-semibold text-lg">
								<User class="w-4 h-4" />
								<span>{eval_.studentName}</span>
								<span
									class="bg-muted px-2 py-0.5 rounded-full font-normal text-muted-foreground text-xs"
									>{eval_.studentIdCode}</span
								>
							</div>
							<div
								class="px-3 py-1 rounded-md font-bold text-lg"
								class:bg-emerald-50={eval_.value >= 0}
								class:text-emerald-600={eval_.value >= 0}
								class:bg-red-50={eval_.value < 0}
								class:text-red-600={eval_.value < 0}
							>
								{eval_.value > 0 ? '+' : ''}{eval_.value}
							</div>
						</div>

						<div class="flex gap-6 mb-4 text-muted-foreground text-sm">
							<div class="flex items-center gap-1.5">
								<Tag class="w-3.5 h-3.5" />
								<span>{eval_.category} › {eval_.subCategory}</span>
							</div>
							<div class="flex items-center gap-1.5">
								<Calendar class="w-3.5 h-3.5" />
								<span>{formatDate(eval_.timestamp)}</span>
							</div>
						</div>

						{#if eval_.details}
							<div class="bg-muted p-3 border-border border-l-3 rounded-md text-sm">
								{eval_.details}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
