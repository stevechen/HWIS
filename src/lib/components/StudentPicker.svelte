<script lang="ts">
	import { Search, X, Check } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { untrack } from 'svelte';
	import { StudentPickerState, gradeLabel } from './student-picker.svelte';
	import type { PickerStudent } from './student-picker.svelte';
	import type { Id } from '$convex/_generated/dataModel';

	let {
		students = [],
		initialSelectedIds = [],
		selectedStudentIds = $bindable([])
	}: {
		students: PickerStudent[];
		initialSelectedIds?: Id<'students'>[];
		selectedStudentIds: Id<'students'>[];
	} = $props();

	// initialSelectedIds is intentionally read once at construction (prefill);
	// untrack makes that explicit so we don't re-seed on later prop changes.
	const state = new StudentPickerState(untrack(() => initialSelectedIds));

	// Prop -> state sync. Guarded by a non-reactive last-seen reference so we
	// never write the same reactive array we're reading in one effect.
	let lastStudents: PickerStudent[] = [];
	$effect(() => {
		if (students === lastStudents) return;
		lastStudents = students;
		state.setStudents(students);
	});

	// State -> bindable prop sync (mirror only leaves the selection ownership
	// with the component; the parent just receives IDs for submit/validation).
	$effect(() => {
		selectedStudentIds = Array.from(state.selectedStudentIds);
	});
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<div class="mb-3 flex items-center justify-between">
		<span class="text-sm font-medium">{state.selectedStudentIds.size} selected</span>
		{#if state.selectedStudentIds.size > 0}
			<button
				class="text-muted-foreground hover:text-foreground text-xs underline"
				onclick={() => state.clearAll()}
			>
				Clear all
			</button>
		{/if}
	</div>

	{#if state.selectedStudentIds.size > 0}
		<div class="mb-3 flex flex-wrap gap-2">
			{#each state.selectedStudents as student (student._id)}
				<span
					class="bg-accent text-accent-foreground flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
				>
					{student.englishName}
					<button
						class="hover:text-destructive rounded-full transition-colors"
						aria-label={`Remove ${student.englishName}`}
						onclick={() => state.remove(student._id)}
					>
						<X class="size-3.5" />
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<div class="relative mb-3">
		<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
		<Input
			type="text"
			testId="evaluations-new.search-input"
			placeholder="Filter by names (separated by commas) or ID..."
			value={state.searchQuery}
			oninput={(e) => (state.searchQuery = e.currentTarget.value)}
			class="pl-10"
			aria-label="Search students"
		/>
	</div>

	<div
		class="bg-muted max-h-72 min-h-0 flex-1 overflow-y-auto rounded-md border lg:max-h-none"
		role="list"
		aria-label="Students"
	>
		{#if state.matched.length > 0}
			<button
				data-testid="evaluations-new.select-all"
				class="bg-background/90 hover:bg-accent/90 sticky top-0 z-10 flex w-full cursor-pointer items-center justify-between gap-4 border-b px-3 py-2.5 text-left backdrop-blur-sm transition-colors"
				onclick={() => state.addAll(state.matched.map((s) => s._id))}
			>
				<span class="text-sm font-medium">Add all {state.matched.length} results</span>
			</button>
		{/if}

		{#if state.matched.length === 0}
			<div class="text-muted-foreground p-8 text-center">No students found</div>
		{:else}
			{#each state.matched as student (student._id)}
				{@const selected = state.selectedStudentIds.has(student._id)}
				<div
					data-testid="evaluations-new.student-row-{student.englishName}"
					class="bg-background hover:bg-accent even:bg-muted/50 flex cursor-pointer items-center gap-4 border-b p-3 transition-colors last:border-b-0"
					class:text-muted-foreground={selected}
					class:opacity-70={selected}
					onclick={() => state.toggle(student._id)}
					onkeydown={(e) => e.key === 'Enter' && state.toggle(student._id)}
					role="button"
					aria-label={`${selected ? 'Deselect' : 'Select'} ${student.englishName}`}
					tabindex="0"
				>
					{#if selected}
						<Check
							class="size-4 shrink-0 text-emerald-600"
							data-testid="evaluations-new.student-check-{student.englishName}"
						/>
					{/if}
					<div class="flex flex-col">
						<span class="font-medium">{student.englishName}</span>
						<span class="text-muted-foreground text-xs">{gradeLabel(student)}</span>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
