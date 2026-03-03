<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { Search } from '@lucide/svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
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

	let searchQuery = $state('');
	let selectedStudentIds = new SvelteSet<Id<'students'>>();
	let categoryId = $state<string | undefined>(undefined);
	let points = $state(1);
	let details = $state('');
	let loading = $state(false);
	let submitted = $state(false);

	// Reactive validation errors that update as user makes selections
	let validationErrors = $derived(() => {
		if (!submitted) return [];
		const errors: string[] = [];
		if (selectedStudentIds.size === 0) {
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

	let filteredStudents = $derived(
		studentsQuery.data?.filter((s) => {
			if (!searchQuery.trim()) return true;
			const terms = searchQuery
				.split(',')
				.map((t) => t.trim().toLowerCase())
				.filter((t) => t.length > 0);
			if (terms.length === 0) return true;

			return terms.some(
				(term) =>
					s.englishName.toLowerCase().includes(term) ||
					s.chineseName.toLowerCase().includes(term) ||
					s.studentId.toLowerCase().includes(term)
			);
		}) || []
	);

	let selectedCategory = $derived(categoriesQuery.data?.find((c) => c._id === categoryId));

	async function handleSubmit() {
		submitted = true;

		if (selectedStudentIds.size === 0 || !categoryId) {
			return;
		}

		loading = true;

		try {
			await client.mutation(api.evaluations.create, {
				studentIds: Array.from(selectedStudentIds) as Id<'students'>[],
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

	function toggleStudent(id: Id<'students'>) {
		if (selectedStudentIds.has(id)) {
			selectedStudentIds.delete(id);
		} else {
			selectedStudentIds.add(id);
		}
	}

	// Derived values for "check all" checkbox state
	let allFilteredSelected = $derived(
		filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.has(s._id))
	);

	let someFilteredSelected = $derived(
		filteredStudents.some((s) => selectedStudentIds.has(s._id)) && !allFilteredSelected
	);

	function toggleAllFiltered() {
		if (allFilteredSelected) {
			// Deselect all filtered students
			for (const student of filteredStudents) {
				selectedStudentIds.delete(student._id);
			}
		} else {
			// Select all filtered students
			for (const student of filteredStudents) {
				selectedStudentIds.add(student._id);
			}
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

<div class="mx-auto p-8 max-w-5xl">
	<div class="gap-8 grid grid-cols-1 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>1. Select Students</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="relative mb-4">
					<Search class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2" />
					<Input
						type="text"
						placeholder="Filter by name or ID..."
						bind:value={searchQuery}
						class="pl-10"
						aria-label="Search students"
					/>
				</div>

				<div
					class="bg-muted border rounded-md max-h-72 overflow-y-auto"
					role="list"
					aria-label="Students"
				>
					{#if studentsQuery.isLoading}
						<div class="p-8 text-muted-foreground text-center">Loading students...</div>
					{:else if filteredStudents.length === 0}
						<div class="p-8 text-muted-foreground text-center">No students found</div>
					{:else}
						{#if filteredStudents.length > 1}
							<div
								class="bg-background hover:bg-accent border-b transition-colors cursor-pointer"
								onclick={toggleAllFiltered}
								onkeydown={(e) => e.key === 'Enter' && toggleAllFiltered()}
								role="button"
								tabindex="0"
							>
								<div class="flex items-center gap-4 p-3">
									<input
										id="select-all"
										type="checkbox"
										checked={allFilteredSelected}
										indeterminate={someFilteredSelected}
										tabindex="-1"
										class="border-input rounded focus:ring-primary size-4 text-primary cursor-pointer"
										aria-label="Select all students"
										onclick={(e) => e.stopPropagation()}
										onchange={(e) => {
											e.stopPropagation();
											toggleAllFiltered();
										}}
									/>
									<span class="font-medium text-sm">Select all ({filteredStudents.length})</span>
								</div>
							</div>
						{/if}
						{#each filteredStudents as student (student._id)}
							<div
								class="bg-background hover:bg-accent border-b last:border-b-0 transition-colors cursor-pointer"
								class:bg-accent={selectedStudentIds.has(student._id)}
								onclick={() => toggleStudent(student._id)}
								onkeydown={(e) => e.key === 'Enter' && toggleStudent(student._id)}
								role="button"
								aria-label={`Select ${student.englishName}`}
								tabindex="0"
							>
								<div class="flex items-center gap-4 p-3">
									<input
										id={`select-${student.englishName}`}
										type="checkbox"
										checked={selectedStudentIds.has(student._id)}
										tabindex="-1"
										class="border-input rounded focus:ring-primary size-4 text-primary cursor-pointer"
										onclick={(e) => e.stopPropagation()}
										onchange={(e) => {
											e.stopPropagation();
											toggleStudent(student._id);
										}}
									/>
									<div class="flex flex-col">
										<span class="font-medium">{student.englishName}</span>
										<span class="text-muted-foreground text-xs">
											Grade {student.classInfo?.grade}{student.classInfo?.class
												? `-${student.classInfo.class}`
												: ''}{student.classInfo?.homeroomTeacherName
												? ` (${student.classInfo.homeroomTeacherName})`
												: ''}
										</span>
									</div>
								</div>
							</div>
						{/each}
					{/if}
				</div>

				<p class="mt-4 font-medium text-primary text-sm">
					{selectedStudentIds.size} student(s) selected
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>2. Evaluation Details</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="mb-5">
					<label class="block mb-2 font-medium text-sm">
						Category
						<Select.Root type="single" bind:value={categoryId}>
							<Select.Trigger class="mt-1" aria-label="Select category">
								{selectedCategory?.name ?? 'Select Category'}
							</Select.Trigger>
							<Select.Content>
								{#each categoriesQuery.data || [] as cat (cat._id)}
									<Select.Item value={cat._id}>{cat.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</label>

					<!-- Show criteria when category selected -->
					{#if selectedCategory?.meritCriteria || selectedCategory?.demeritCriteria}
						<CategoryInfoCard category={selectedCategory} />
					{/if}
				</div>

				<fieldset class="mb-5">
					<legend class="block mb-2 font-medium text-sm">Points</legend>
					<div class="gap-2 grid grid-cols-4">
						<Button
							type="button"
							variant="outline"
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

				<div class="mb-5">
					<label class="block mb-2 font-medium text-sm">
						Details / Comments
						<textarea
							id="evaluation-details"
							bind:value={details}
							placeholder="Enter specific details about the behavior..."
							class="flex bg-background disabled:opacity-50 mt-1 px-3 py-2 border border-input rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-offset-background focus-visible:ring-offset-2 w-full min-h-20 placeholder:text-muted-foreground text-sm resize-none disabled:cursor-not-allowed"
							rows="4"
						></textarea>
					</label>
				</div>

				{#if validationErrors().length > 0}
					<div role="alert" class="bg-destructive/10 mb-4 p-3 rounded-md text-destructive text-sm">
						{#each validationErrors() as errorMsg}
							<div>{errorMsg}</div>
						{/each}
					</div>
				{/if}

				<Button
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
