<script lang="ts">
	import { GripVertical } from '@lucide/svelte';
	import { draggable } from '$lib/utils/dnd.svelte';
	import type { MultiSelectState } from '$lib/utils/multiSelect.svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import type { House } from '$lib/constants/houses';

	type Student = {
		_id: Id<'students'>;
		englishName: string;
		chineseName: string;
		studentId: string;
		status: 'Enrolled' | 'Not Enrolled';
		house?: House;
		classDisplay: string;
	};

	let {
		student,
		sourceHouse,
		multiSelect,
		onOpenDialog
	}: {
		student: Student;
		sourceHouse: string;
		multiSelect: MultiSelectState;
		onOpenDialog: (student: Student) => void;
	} = $props();

	const enrolled = $derived(student.status !== 'Not Enrolled');
	const isSelected = $derived(multiSelect.selectedIds.has(student._id));
	const moveLabel = $derived(
		sourceHouse === 'orphaned'
			? `Move ${student.englishName} to a house`
			: `Move ${student.englishName} to another house`
	);
</script>

<div
	class={[
		'flex items-center gap-2 rounded border bg-white px-2 py-1 text-sm shadow-sm transition-colors hover:bg-gray-50 max-md:gap-3 max-md:py-3',
		!enrolled && 'text-muted-foreground bg-gray-100',
		isSelected && 'ring-2 ring-blue-500 ring-offset-1',
		multiSelect.selectionMode && 'cursor-pointer'
	]}
>
	<div
		use:draggable={{
			data: {
				id: student._id,
				englishName: student.englishName,
				sourceHouse
			},
			label:
				multiSelect.selectionMode &&
				multiSelect.selectedIds.has(student._id) &&
				multiSelect.selectedIds.size > 1
					? `${multiSelect.selectedIds.size} students`
					: student.englishName
		}}
		class={[
			'flex min-w-0 flex-1 items-center gap-2',
			multiSelect.selectionMode ? 'cursor-pointer' : 'cursor-grab'
		]}
		role="button"
		aria-pressed={multiSelect.selectionMode ? isSelected : undefined}
		aria-label={multiSelect.selectionMode ? `Select ${student.englishName}` : moveLabel}
		tabindex="0"
		onclick={() => {
			if (multiSelect.selectionMode) {
				multiSelect.toggleSelect(student._id);
			} else {
				onOpenDialog(student);
			}
		}}
		onkeydown={(e) => {
			if (e.key === 'Enter') {
				if (multiSelect.selectionMode) {
					multiSelect.toggleSelect(student._id);
				} else {
					onOpenDialog(student);
				}
			}
		}}
	>
		{#if multiSelect.selectionMode}
			<input
				type="checkbox"
				checked={isSelected}
				class="size-4 shrink-0 max-md:size-5"
				onclick={(e) => e.stopPropagation()}
				onchange={() => multiSelect.toggleSelect(student._id)}
			/>
		{/if}
		<GripVertical
			class={['size-3 shrink-0 text-gray-400 max-md:hidden', multiSelect.selectionMode && 'hidden']}
		/>
		<div class="flex min-w-0 flex-1 flex-col">
			<span class="truncate font-medium">{student.englishName}</span>
			{#if !enrolled}
				<span class="text-muted-foreground text-xs">Not Enrolled</span>
			{/if}
		</div>
	</div>
</div>
