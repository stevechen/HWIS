<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Plus, ArrowLeft } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';

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

	const evaluationsQuery = useQuery(api.evaluations.listRecent, () => ({
		limit: 50,
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));

	// Transform query data to EvaluationEntry format
	const evaluations = $derived.by(() => {
		if (evaluationsQuery.data) {
			return evaluationsQuery.data.map((e) => ({
				_id: e._id,
				value: e.value,
				category: e.category,
				subCategory: e.subCategory,
				details: e.details,
				timestamp: e.timestamp,
				englishName: e.englishName,
				grade: e.grade,
				studentId: e.studentId,
				isAdmin: false
			})) as EvaluationEntry[];
		}
		return [];
	});

	// Sort state
	let sortAscending = $state(false);
	// Show details state
	let showDetails = $state(false);

	// Sorted evaluations
	const sortedEvaluations = $derived(() => {
		const evals = evaluations;
		if (sortAscending) {
			return [...evals].sort((a, b) => a.timestamp - b.timestamp);
		}
		return [...evals].sort((a, b) => b.timestamp - a.timestamp);
	});

	function handleCardClick(entry: EvaluationEntry) {
		// Navigation is handled by href
	}
</script>

<div class="mx-auto max-w-6xl p-8">
	<header class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-4">
			{#if isAdmin}
				<Button variant="outline" onclick={() => void goto('/admin')}>
					<ArrowLeft class="size-4" />
					<span class="ml-2 hidden sm:inline">Back to Admin</span>
				</Button>
			{/if}
			<h1 class="text-foreground text-lg font-semibold sm:text-2xl">Evaluation History</h1>
		</div>
		<div class="flex items-center gap-2">
			<ThemeToggle />
			<Button onclick={() => void goto('/evaluations/new')}>
				<Plus class="size-4" />
				New
			</Button>
		</div>
	</header>

	{#if evaluationsQuery.isLoading}
		<div class="text-muted-foreground py-16 text-center">Loading history...</div>
	{:else if evaluations.length === 0}
		<div class="bg-card border-input rounded-lg border p-8 text-center">
			<p class="text-muted-foreground mb-6">No evaluations found. Start by awarding some points!</p>
			<Button onclick={() => void goto('/evaluations/new')}>Give Points</Button>
		</div>
	{:else}
		<EvaluationsTimeline
			evaluations={sortedEvaluations()}
			title="Recent"
			showStudentName={true}
			{isAdmin}
			showTeacherFilter={false}
			showLegend={false}
			showTeacherName={false}
			enableCardClick={true}
			cardHref={(entry) => `/evaluations/student/${entry.studentId}`}
			onCardClick={handleCardClick}
			bind:sortAscending
			bind:showDetails
		/>
	{/if}
</div>
