<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { api as apiAny } from '$convex/_generated/api';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { RotateCcw } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Card from '$lib/components/ui/card';

	let client = useConvexClient();
	let currentUser = useQuery(api.users.viewer, {});
	let refreshTrigger = $state(0);
	let studentsQuery = useQuery(api.students.list, () => ({ _trigger: refreshTrigger }));

	let isAdvancing = $state(false);
	let advanceResult = $state<any>(null);
	let showAdvanceDialog = $state(false);

	let isTestMode = $state(false);
	$effect(() => {
		if (browser && currentUser.isLoading === false) {
			if (typeof document !== 'undefined') {
				isTestMode = document.cookie.split('; ').some((c) => c.startsWith('hwis_test_auth='));
			}
			if (!isTestMode && currentUser.data?.role !== 'admin' && currentUser.data?.role !== 'super') {
				goto('/');
			}
		}
	});

	function refreshStudents() {
		refreshTrigger++;
	}

	async function handleAdvanceYear() {
		isAdvancing = true;
		advanceResult = null;
		try {
			const result = await client.mutation(apiAny.backup.advanceGradesAndClearEvaluations, {});
			advanceResult = result;
			refreshStudents();
		} catch (e: any) {
			alert('Failed: ' + e.message);
		} finally {
			isAdvancing = false;
		}
	}
</script>

<div class="bg-background min-h-screen">
	<header class="bg-card border-b shadow-sm">
		<div class="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<Button variant="outline" onclick={() => goto('/admin')}>Back to Admin</Button>
					<h1 class="text-foreground text-2xl font-bold">Year-End Reset</h1>
				</div>
				<ThemeToggle />
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
		<div class="grid gap-6">
			<Card.Root>
				<Card.Header>
					<div class="mb-2 flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900"
						>
							<RotateCcw class="h-5 w-5 text-blue-600 dark:text-blue-400" />
						</div>
						<Card.Title>Advance Academic Year</Card.Title>
					</div>
					<Card.Description
						>Promote all enrolled students to the next grade and clear all evaluations for the new
						year.</Card.Description
					>
				</Card.Header>
				<Card.Content>
					<div
						class="mb-4 rounded bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300"
					>
						<p class="font-medium">This will:</p>
						<ul class="mt-2 list-disc space-y-1 pl-4">
							<li>Advance all enrolled students to the next grade</li>
							<li>Clear all evaluations from the database</li>
						</ul>
					</div>
					<Button
						variant="default"
						class="w-full"
						onclick={() => (showAdvanceDialog = true)}
						disabled={isAdvancing}
					>
						{isAdvancing ? 'Processing...' : 'Advance Year & Clear Data'}
					</Button>
					{#if advanceResult}
						<div
							class="mt-4 rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
						>
							<p class="font-medium">{advanceResult.message}</p>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</main>
</div>

{#if showAdvanceDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="absolute inset-0 bg-black/50"
			onclick={() => (showAdvanceDialog = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showAdvanceDialog = false)}
		></div>
		<div class="bg-background relative w-full max-w-lg rounded-lg border p-6 shadow-lg">
			<h2 class="text-lg font-semibold">Advance Academic Year</h2>
			<div class="py-4">
				<div
					class="rounded bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
				>
					<p class="font-medium">This will:</p>
					<ul class="mt-2 list-disc pl-4">
						<li>Create a backup of all data</li>
						<li>Clear ALL evaluations</li>
						<li>Delete ALL grade 12 students (Enrolled and Not Enrolled)</li>
						<li>Delete ALL Not Enrolled students (grades 7-11)</li>
						<li>Advance enrolled students (grades 7-11) to the next grade</li>
					</ul>
					<p class="mt-2 font-medium">This action cannot be undone!</p>
				</div>
			</div>
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={() => (showAdvanceDialog = false)}>Cancel</Button>
				<Button
					onclick={() => {
						showAdvanceDialog = false;
						handleAdvanceYear();
					}}
					disabled={isAdvancing}
				>
					{isAdvancing ? 'Processing...' : 'Confirm'}
				</Button>
			</div>
		</div>
	</div>
{/if}
