<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { goto } from '$app/navigation';
	import { Search } from '@lucide/svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
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
	const categoriesQuery = useQuery(api.categories.list, {});
	const studentsQuery = useQuery(api.students.list, {});

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
		if (selectedStudentIds.size === 0) {
			error = 'Please select at least one student';
			return;
		}
		if (!categoryId) {
			error = 'Please select a category';
			return;
		}
		if (selectedCategory?.subCategories.length && !subCategory) {
			error = 'Please select a sub-category';
			return;
		}

		loading = true;
		error = '';

		try {
			await client.mutation(api.evaluations.create, {
				studentIds: Array.from(selectedStudentIds) as Id<'students'>[],
				value: points,
				category: selectedCategory!.name,
				subCategory,
				details,
				semesterId: getCurrentSemesterId()
			});

			void goto('/');
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

	function handleBack() {
		void goto('/');
	}
</script>

<div class="mx-auto max-w-5xl p-8">
	<header class="mb-8 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="outline" onclick={handleBack}>← Back</Button>
			<h1 class="text-foreground text-2xl font-semibold">New Evaluation</h1>
		</div>
		<ThemeToggle />
	</header>

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>1. Select Students</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="relative mb-4">
					<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
					<Input
						type="text"
						placeholder="Filter by name or ID..."
						bind:value={searchQuery}
						class="pl-10"
						aria-label="Search students"
					/>
				</div>

				<div class="bg-muted max-h-72 overflow-y-auto rounded-md border">
					{#if studentsQuery.isLoading}
						<div class="text-muted-foreground p-8 text-center">Loading students...</div>
					{:else if filteredStudents.length === 0}
						<div class="text-muted-foreground p-8 text-center">No students found</div>
					{:else}
						{#each filteredStudents as student (student._id)}
							<div
								class="bg-background hover:bg-accent cursor-pointer border-b transition-colors last:border-b-0"
								class:bg-accent={selectedStudentIds.has(student._id)}
								onclick={() => toggleStudent(student._id)}
								onkeydown={(e) => e.key === 'Enter' && toggleStudent(student._id)}
								role="button"
								tabindex="0"
							>
								<div class="flex items-center gap-4 p-3">
									<input
										type="checkbox"
										checked={selectedStudentIds.has(student._id)}
										tabindex="-1"
										class="border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer rounded"
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
										{subCategory || 'Select Sub-Category'}
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
						{#each [-2, -1, 1, 2] as p (p)}
							<Button
								type="button"
								variant={points === p ? 'default' : 'outline'}
								onclick={() => (points = p)}
								aria-label={p > 0 ? `Award ${p} points` : `Deduct ${Math.abs(p)} points`}
							>
								{p > 0 ? '+' : ''}{p}
							</Button>
						{/each}
					</div>
				</fieldset>

				<div class="mb-5">
					<label class="mb-2 block text-sm font-medium">
						Details / Comments
						<textarea
							bind:value={details}
							placeholder="Enter specific details about the behavior..."
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring mt-1 flex min-h-20 w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							rows="4"
						></textarea>
					</label>
				</div>

				{#if error}
					<div class="bg-destructive/10 text-destructive mb-4 rounded-md p-3 text-sm">
						{error}
					</div>
				{/if}

				<Button
					class="w-full"
					onclick={handleSubmit}
					disabled={loading}
					aria-label="Submit evaluation for {selectedStudentIds.size} student(s)"
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
