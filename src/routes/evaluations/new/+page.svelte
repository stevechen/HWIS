<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { lockCutoffFor } from '$convex/shared/evaluation_week';
	import type { Id } from '$convex/_generated/dataModel';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import StudentPicker from '$lib/components/StudentPicker.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { Lock } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import CategoryInfoCard from '$lib/components/CategoryInfoCard.svelte';

	function getCurrentSemesterId(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;
		const half = month < 2 || month > 8 ? 'H1' : 'H2';
		const semesterYear = half === 'H1' ? year : year - 1;
		return `${semesterYear}-${half}`;
	}

	const lockDate = new Date(lockCutoffFor(Date.now()));
	const lockDateStr = lockDate.toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'Asia/Taipei'
	});

	let selectedStudentIds = $state<Id<'students'>[]>([]);
	let categoryId = $state<string | undefined>(undefined);
	let points = $state(1);
	let details = $state('');
	let loading = $state(false);
	let submitted = $state(false);

	// Reactive validation errors that update as user makes selections
	let validationErrors = $derived.by(() => {
		if (!submitted) return [];
		const errors: string[] = [];
		if (selectedStudentIds.length === 0) {
			errors.push('Please select at least one student');
		}
		if (!categoryId) {
			errors.push('Please select a category');
		}
		return errors;
	});

	const client = useConvexClient();
	const categoriesQuery = useQuery(api.categories.list, () => ({}));
	const studentsQuery = useQuery(api.students.list, () => ({ status: 'Enrolled' as const }));

	// Stable reference for the picker (avoids a fresh [] each render)
	let pickerStudents = $derived(studentsQuery.data ?? []);

	let selectedCategory = $derived(categoriesQuery.data?.find((c) => c._id === categoryId));

	async function handleSubmit() {
		submitted = true;

		if (selectedStudentIds.length === 0 || !categoryId) {
			return;
		}

		loading = true;

		try {
			await client.mutation(api.evaluations.create, {
				studentIds: selectedStudentIds,
				value: points,
				categoryId: categoryId as unknown as Id<'point_categories'>,
				details,
				semesterId: getCurrentSemesterId()
			});

			void goto('/evaluations');
		} catch (err) {
			// Show submission error
			console.error('Failed to save evaluation:', err);
		} finally {
			loading = false;
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		const isInputFocused =
			document.activeElement instanceof HTMLInputElement ||
			document.activeElement instanceof HTMLTextAreaElement ||
			document.activeElement instanceof HTMLSelectElement;

		// Allow Ctrl/Cmd+Enter even when input is focused
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			e.preventDefault();
			handleSubmit();
			return;
		}

		// Skip other shortcuts when typing in inputs
		if (isInputFocused) {
			return;
		}

		// Process point shortcuts
		if (e.key === '1' || e.key === '+') {
			e.preventDefault();
			points = 1;
		} else if (e.key === '2') {
			e.preventDefault();
			points = 2;
		} else if ((e.key === '!' && e.shiftKey) || e.key === '-') {
			// Shift+1 = '!' or '-' key for -1
			e.preventDefault();
			points = -1;
		} else if (e.key === '@' && e.shiftKey) {
			// Shift+2 = '@' for -2
			e.preventDefault();
			points = -2;
		}
	}

	const selectedPointButtonTextClass = 'text-white hover:text-white';
	const selectedPositivePointButtonClass = `border-emerald-600 bg-emerald-600 hover:bg-emerald-600/90 dark:border-emerald-500 dark:bg-emerald-500 ${selectedPointButtonTextClass}`;
	const selectedNegativePointButtonClass = `border-red-600 bg-red-600 hover:bg-red-600/90 dark:border-red-500 dark:bg-red-500 ${selectedPointButtonTextClass}`;
	const unselectedPositivePointButtonClass =
		'border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30';
	const unselectedNegativePointButtonClass =
		'border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30';

	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', handleGlobalKeydown);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleGlobalKeydown);
		}
	});
</script>

<div class="mx-auto max-w-5xl p-8 lg:h-[calc(100vh-7.5rem)]">
	<div class="grid grid-cols-1 gap-8 lg:h-full lg:grid-cols-2 lg:grid-rows-1">
		<Card.Root>
			<Card.Header>
				<Card.Title>1. Select Students</Card.Title>
			</Card.Header>
			<Card.Content class="flex min-h-0 flex-1 flex-col">
				{#if studentsQuery.isLoading}
					<div
						class="text-muted-foreground flex flex-1 items-center justify-center rounded-md border p-8 text-center"
					>
						Loading students...
					</div>
				{:else}
					<StudentPicker students={pickerStudents} bind:selectedStudentIds />
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>2. Evaluation Details</Card.Title>
				<p
					class="text-muted-foreground flex items-center gap-1.5 text-xs"
					data-testid="evaluations-new.lock-notice"
				>
					<Lock class="size-3.5 text-red-400" />
					*This evaluation locks for edits on {lockDateStr} (Monday 00:00)
				</p>
			</Card.Header>
			<Card.Content class="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<div class="mb-5">
					<label class="mb-2 block text-sm font-medium">
						Category
						<Select.Root type="single" bind:value={categoryId}>
							<Select.Trigger
								testId="evaluations-new.category-trigger"
								class="mt-1"
								aria-label="Select category"
							>
								{selectedCategory?.name ?? 'Select Category'}
							</Select.Trigger>
							<Select.Content>
								{#each categoriesQuery.data || [] as cat (cat._id)}
									<Select.Item value={cat._id}>{cat.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</label>

					<CategoryInfoCard
						category={selectedCategory}
						placeholder={!selectedCategory}
						oncriterionclick={(criterion) => {
							details = details + (details ? '\n' : '') + criterion;
						}}
					/>
				</div>

				<fieldset class="mb-5">
					<legend class="mb-2 block text-sm font-medium">Points</legend>
					<div class="grid grid-cols-4 gap-2">
						<Button
							type="button"
							variant="outline"
							testId="evaluations-new.point--2"
							class={[
								(points === -2 && selectedNegativePointButtonClass) ||
									unselectedNegativePointButtonClass
							]}
							onclick={() => (points = -2)}
							aria-label="Deduct 2 points"
							title="-2 points (press Shift+2)"
							aria-keyshortcuts="Shift+2"
						>
							-2
						</Button>
						<Button
							type="button"
							variant="outline"
							testId="evaluations-new.point--1"
							class={[
								(points === -1 && selectedNegativePointButtonClass) ||
									unselectedNegativePointButtonClass
							]}
							onclick={() => (points = -1)}
							aria-label="Deduct 1 point"
							title="-1 point (press Shift+1 or -)"
							aria-keyshortcuts="Shift+1 -"
						>
							-1
						</Button>
						<Button
							type="button"
							variant="outline"
							testId="evaluations-new.point-1"
							class={[
								(points === 1 && selectedPositivePointButtonClass) ||
									unselectedPositivePointButtonClass
							]}
							onclick={() => (points = 1)}
							aria-label="Award 1 point"
							title="+1 point (press 1 or +)"
							aria-keyshortcuts="1 +"
						>
							+1
						</Button>
						<Button
							type="button"
							variant="outline"
							testId="evaluations-new.point-2"
							class={[
								(points === 2 && selectedPositivePointButtonClass) ||
									unselectedPositivePointButtonClass
							]}
							onclick={() => (points = 2)}
							aria-label="Award 2 points"
							title="+2 points (press 2)"
							aria-keyshortcuts="2"
						>
							+2
						</Button>
					</div>
				</fieldset>

				<div class="mb-5 flex flex-1 flex-col">
					<label class="mb-2 flex flex-1 flex-col text-sm font-medium">
						Details / Comments
						<textarea
							id="evaluation-details"
							data-testid="evaluations-new.details"
							bind:value={details}
							placeholder="Enter specific details about the behavior..."
							class="bg-background border-input focus-visible:ring-ring ring-offset-background placeholder:text-muted-foreground mt-1 min-h-20 w-full flex-1 resize-none rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							rows="4"
						></textarea>
					</label>
				</div>

				{#if validationErrors.length > 0}
					<div
						data-testid="evaluations-new.errors"
						role="alert"
						class="bg-destructive/10 text-destructive mb-4 rounded-md p-3 text-sm"
					>
						{#each validationErrors as errorMsg (errorMsg)}
							<div>{errorMsg}</div>
						{/each}
					</div>
				{/if}

				<Button
					testId="evaluations-new.submit-button"
					class="w-full"
					onclick={handleSubmit}
					disabled={loading}
					aria-label="Submit evaluation"
					title="Submit evaluation (Ctrl+Enter)"
				>
					{#if loading}
						Saving...
					{:else}
						Submit Evaluation
					{/if}
				</Button>
			</Card.Content>
		</Card.Root>
	</div>
</div>
