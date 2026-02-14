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
	let categoryId = $state('');
	let subCategory = $state('');
	let points = $state(1);
	let details = $state('');
	let loading = $state(false);
	let error = $state('');

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
	let resolvedSubCategory = $derived(
		selectedCategory && selectedCategory.subCategories.includes(subCategory) ? subCategory : ''
	);

	async function handleSubmit() {
		if (selectedStudentIds.size === 0) {
			error = 'Please select at least one student';
			return;
		}
		if (!categoryId) {
			error = 'Please select a category';
			return;
		}
		if (selectedCategory?.subCategories.length && !resolvedSubCategory) {
			error = 'Please select a sub-category';
			return;
		}

		loading = true;
		error = '';

		try {
			await client.mutation(api.evaluations.create, {
				studentIds: Array.from(selectedStudentIds) as Id<'students'>[],
				value: points,
				categoryId: categoryId as Id<'point_categories'>,
				subCategory: resolvedSubCategory,
				details,
				semesterId: getCurrentSemesterId()
			});

			void goto('/evaluations');
		} catch (err) {
			error = (err as Error).message || 'Failed to save evaluations';
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

<div class="mx-auto max-w-5xl p-8">
	<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>1. Select Students</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="relative mb-4">
					<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
					<Input
						type="text"
						placeholder="Filter by name or ID..."
						bind:value={searchQuery}
						class="pl-10"
						aria-label="Search students"
					/>
				</div>

				<div
					class="bg-muted max-h-72 overflow-y-auto rounded-md border"
					role="list"
					aria-label="Students"
				>
					{#if studentsQuery.isLoading}
						<div class="text-muted-foreground p-8 text-center">Loading students...</div>
					{:else if filteredStudents.length === 0}
						<div class="text-muted-foreground p-8 text-center">No students found</div>
					{:else}
						{#if filteredStudents.length > 1}
							<div
								class="bg-background hover:bg-accent cursor-pointer border-b transition-colors"
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
										class="border-input focus:ring-primary text-primary size-4 cursor-pointer rounded"
										aria-label="Select all students"
										onclick={(e) => e.stopPropagation()}
										onchange={(e) => {
											e.stopPropagation();
											toggleAllFiltered();
										}}
									/>
									<span class="text-sm font-medium">Select all ({filteredStudents.length})</span>
								</div>
							</div>
						{/if}
						{#each filteredStudents as student (student._id)}
							<div
								class="bg-background hover:bg-accent cursor-pointer border-b transition-colors last:border-b-0"
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
										class="border-input focus:ring-primary text-primary size-4 cursor-pointer rounded"
										onclick={(e) => e.stopPropagation()}
										onchange={(e) => {
											e.stopPropagation();
											toggleStudent(student._id);
										}}
									/>
									<div class="flex flex-col">
										<span class="font-medium">{student.englishName} ({student.chineseName})</span>
										<span class="text-muted-foreground text-xs"
											>Grade {student.grade} • {student.studentId}</span
										>
									</div>
								</div>
							</div>
						{/each}
					{/if}
				</div>

				<p class="text-primary mt-4 text-sm font-medium">
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
					<label class="mb-2 block text-sm font-medium">
						Category
						<Select.Root type="single" bind:value={categoryId}>
							<Select.Trigger class="mt-1" aria-label="Select category">
								{selectedCategory?.name || 'Select Category'}
							</Select.Trigger>
							<Select.Content>
								{#each categoriesQuery.data || [] as cat (cat._id)}
									<Select.Item value={cat._id}>{cat.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</label>
				</div>

				{#if selectedCategory}
					{#if selectedCategory.subCategories.length > 0}
						<div class="mb-5">
							<label class="mb-2 block text-sm font-medium">
								Sub-Category
								<Select.Root type="single" bind:value={subCategory}>
									<Select.Trigger class="mt-1" aria-label="Select sub-category">
										{resolvedSubCategory || 'Select Sub-Category'}
									</Select.Trigger>
									<Select.Content>
										{#each selectedCategory.subCategories as sub (sub)}
											<Select.Item value={sub}>{sub}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</label>
						</div>
					{:else}
						<input type="hidden" bind:value={subCategory} />
					{/if}
				{/if}

				<fieldset class="mb-5">
					<legend class="mb-2 block text-sm font-medium">Points</legend>
					<div class="grid grid-cols-4 gap-2">
						<Button
							type="button"
							variant={points === -2 ? 'default' : 'outline'}
							onclick={() => (points = -2)}
							aria-label="Deduct 2 points"
							title="-2 points (press Shift+2)"
							aria-keyshortcuts="Shift+2"
						>
							-2
						</Button>
						<Button
							type="button"
							variant={points === -1 ? 'default' : 'outline'}
							onclick={() => (points = -1)}
							aria-label="Deduct 1 point"
							title="-1 point (press Shift+1 or -)"
							aria-keyshortcuts="Shift+1 -"
						>
							-1
						</Button>
						<Button
							type="button"
							variant={points === 1 ? 'default' : 'outline'}
							onclick={() => (points = 1)}
							aria-label="Award 1 point"
							title="+1 point (press 1 or +)"
							aria-keyshortcuts="1 +"
						>
							+1
						</Button>
						<Button
							type="button"
							variant={points === 2 ? 'default' : 'outline'}
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
					<label class="mb-2 block text-sm font-medium">
						Details / Comments
						<textarea
							id="evaluation-details"
							bind:value={details}
							placeholder="Enter specific details about the behavior..."
							class="bg-background border-input focus-visible:ring-ring ring-offset-background placeholder:text-muted-foreground mt-1 flex min-h-20 w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							rows="4"
						></textarea>
					</label>
				</div>

				{#if error}
					<div role="alert" class="bg-destructive/10 text-destructive mb-4 rounded-md p-3 text-sm">
						{error}
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
