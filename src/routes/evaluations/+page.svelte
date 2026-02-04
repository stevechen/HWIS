<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { EvaluationsTimeline, type EvaluationEntry } from '$lib/components/timeline';

	const user = useQuery(api.users.viewer, () => ({}));

	const isAdmin = $derived.by(() => {
		if (!user.isLoading && user.data?.role) {
			return user.data.role === 'admin' || user.data.role === 'super';
		}
		return false;
	});

	const evaluationsQuery = useQuery(api.evaluations.listRecent, () => ({
		limit: 50
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
	const sortedEvaluations = $derived.by(() => {
		const evals = evaluations;
		if (sortAscending) {
			return [...evals].sort((a, b) => a.timestamp - b.timestamp);
		}
		return [...evals].sort((a, b) => b.timestamp - a.timestamp);
	});

	function handleCardClick(_entry: EvaluationEntry): void {
		// Navigation is handled by href
		void _entry;
	}
</script>

<div class="mx-auto p-8 max-w-6xl">
	{#if !evaluationsQuery.isLoading && evaluations.length > 0}
		<div class="flex justify-end mb-6">
			<Button onclick={() => void goto('/evaluations/new')}>
				<Plus class="size-4" />
				New
			</Button>
		</div>
	{/if}

	{#if evaluationsQuery.isLoading}
		<div class="py-16 text-muted-foreground text-center">Loading history...</div>
	{:else if evaluations.length === 0}
		<div class="bg-card p-8 border border-input rounded-lg text-center">
			<p class="mb-6 text-muted-foreground">No evaluations found. Start by awarding some points!</p>
			<Button onclick={() => void goto('/evaluations/new')}>Give Points</Button>
		</div>
	{:else}
		<EvaluationsTimeline
			evaluations={sortedEvaluations}
			title="Recent"
			showStudentName={true}
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
