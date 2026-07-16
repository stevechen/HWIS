<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Users, ChevronDown, ChevronRight } from '@lucide/svelte';
	import { dropZone, dragState } from '$lib/utils/dnd.svelte';
	import type { DragData } from '$lib/utils/dnd.svelte';
	import { Button } from '$lib/components/ui/button';
	import { SvelteSet } from 'svelte/reactivity';

	import { createMultiSelectState } from '$lib/utils/multiSelect.svelte';
	import BulkActionBar from '$lib/components/BulkActionBar.svelte';
	import MoveDialog from '$lib/components/MoveDialog.svelte';
	import StudentCard from '$lib/components/StudentCard.svelte';
	import { HOUSES, HOUSE_COLORS, type House } from '$lib/constants/houses';
	import { houseLogos } from '$lib/assets/house-logos';

	type Student = {
		_id: Id<'students'>;
		englishName: string;
		chineseName: string;
		studentId: string;
		status: 'Enrolled' | 'Not Enrolled';
		house?: House;
		classDisplay: string;
	};

	const housesQuery = useQuery(api.students.listByHouse, () => ({}));
	const client = useConvexClient();

	// Get students data - sorted by class then name
	const housesData = $derived.by(() => {
		const data = housesQuery.data;
		if (!data) {
			return {
				Heracles: [] as Student[],
				Wukong: [] as Student[],
				Ixbalam: [] as Student[],
				Setna: [] as Student[],
				orphaned: [] as Student[]
			};
		}
		return {
			...data.houses,
			orphaned: data.orphaned
		} as Record<House | 'orphaned', Student[]>;
	});

	// Get sorted and grouped students for each house
	function getGroupedStudents(students: Student[]): { className: string; students: Student[] }[] {
		// Sort by classDisplay (numeric-aware), then by englishName
		const sorted = [...students].sort((a, b) => {
			// Extract numeric grade from classDisplay (e.g., "7-IB" -> 7, "10-A" -> 10)
			const getGrade = (classDisplay: string): number => {
				const match = classDisplay.match(/^(\d+)/);
				return match ? parseInt(match[1], 10) : Infinity;
			};

			const gradeA = getGrade(a.classDisplay);
			const gradeB = getGrade(b.classDisplay);

			// First compare by numeric grade
			let classCompare = gradeA - gradeB;
			if (classCompare !== 0) return classCompare;

			// If grades are equal, sort alphabetically
			classCompare = a.classDisplay.localeCompare(b.classDisplay);
			if (classCompare !== 0) return classCompare;

			// Then by name
			return a.englishName.localeCompare(b.englishName);
		});

		// Group by class
		const groups: Record<string, Student[]> = {};
		for (const student of sorted) {
			const classKey = student.classDisplay || 'Unassigned';
			if (!groups[classKey]) {
				groups[classKey] = [];
			}
			groups[classKey].push(student);
		}

		// Convert to array
		return Object.entries(groups).map(([className, students]) => ({
			className,
			students
		}));
	}

	// Get orphaned students separately for use in template
	const orphanedStudents = $derived(housesData.orphaned || []);

	async function assignHouse(studentId: Id<'students'>, house: House | undefined) {
		try {
			await client.mutation(api.students.assignHouse, { studentId, house });
		} catch (err) {
			window.alert(err instanceof Error ? err.message : 'Failed to assign house');
		}
	}

	let collapsedHouses = new SvelteSet<string>(
		typeof window !== 'undefined' &&
			window.innerWidth < 768 &&
			window.matchMedia('(hover: none)').matches
			? [...HOUSES, '__orphaned']
			: []
	);

	let multiSelect = createMultiSelectState();

	async function bulkAssignHouse(house: House | undefined) {
		const ids = Array.from(multiSelect.selectedIds) as Id<'students'>[];
		for (const id of ids) {
			await assignHouse(id, house);
		}
		multiSelect.exitSelectionMode();
	}

	// Find which houses the selected students belong to
	let selectedSourceHouses = $derived.by(() => {
		const selected = multiSelect.selectedIds;
		if (selected.size === 0) return new Set<string>();
		const houses = new SvelteSet<string>();
		for (const [house, students] of Object.entries(housesData)) {
			for (const student of students) {
				if (selected.has(student._id)) {
					houses.add(house);
				}
			}
		}
		return houses;
	});

	// Derived: whether all selected students are from a single house
	let isSingleSource = $derived(selectedSourceHouses.size === 1);
	// Derived: the single source house if all selected students are from one house
	let sourceHouse = $derived(isSingleSource ? [...selectedSourceHouses][0] : null);

	// Derived: bulk actions for moving students to other houses
	let bulkActions = $derived.by(() => {
		const filteredHouses = HOUSES.filter((house) => !(isSingleSource && sourceHouse === house));
		const actions: Array<{ label: string; action: () => void }> = [];
		for (const house of filteredHouses) {
			actions.push({
				label: house,
				action: () => bulkAssignHouse(house)
			});
		}
		if (!(isSingleSource && sourceHouse === 'orphaned')) {
			actions.push({
				label: 'Unassigned',
				action: () => bulkAssignHouse(undefined)
			});
		}
		return actions;
	});

	function toggleCollapse(house: string) {
		if (collapsedHouses.has(house)) {
			collapsedHouses.delete(house);
		} else {
			collapsedHouses.add(house);
		}
	}

	let moveDialogStudent = $state<{
		_id: Id<'students'>;
		englishName: string;
		sourceHouse: string;
	} | null>(null);

	function openMoveDialog(student: Student, sourceHouse: string) {
		moveDialogStudent = {
			_id: student._id,
			englishName: student.englishName,
			sourceHouse
		};
	}

	function closeMoveDialog() {
		moveDialogStudent = null;
	}
</script>

<div class="space-y-4 p-4">
	{#if housesQuery.isLoading}
		<div class="text-muted-foreground py-8 text-center">Loading houses...</div>
	{:else if housesQuery.error}
		<div class="py-8 text-center text-red-500">Error loading houses</div>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-2">
			{#if multiSelect.selectionMode}
				<!-- Inline move targets (desktop) -->
				<div class="ml-4 hidden items-center gap-2 md:flex">
					<span class="text-muted-foreground mr-1 text-xs"
						>Move {multiSelect.selectedCount} student{multiSelect.selectedCount !== 1 ? 's' : ''} to:</span
					>
					{#each HOUSES as targetHouse (targetHouse)}
						{#if !(isSingleSource && selectedSourceHouses.has(targetHouse))}
							<button
								type="button"
								class="inline-flex h-5 shrink-0 items-center justify-center rounded-none border px-2 text-xs shadow-xs {HOUSE_COLORS[
									targetHouse
								].lightBg} {HOUSE_COLORS[targetHouse].text} hover:{HOUSE_COLORS[
									targetHouse
								].lightBg.replace('50', '100')}"
								onclick={() => {
									const ids = Array.from(multiSelect.selectedIds) as Id<'students'>[];
									multiSelect.exitSelectionMode();
									for (const sid of ids) {
										assignHouse(sid, targetHouse);
									}
								}}
							>
								{targetHouse}
							</button>
						{/if}
					{/each}
					{#if !(isSingleSource && sourceHouse === 'orphaned')}
						<button
							type="button"
							class="inline-flex h-5 shrink-0 items-center justify-center rounded-none border bg-gray-50 px-2 text-xs text-gray-700 shadow-xs hover:bg-gray-100"
							onclick={() => {
								const ids = Array.from(multiSelect.selectedIds) as Id<'students'>[];
								multiSelect.exitSelectionMode();
								for (const sid of ids) {
									assignHouse(sid, undefined);
								}
							}}
						>
							Unassigned
						</button>
					{/if}
				</div>
			{/if}
			<Button
				variant="outline"
				size="sm"
				onclick={() => multiSelect.toggleSelectionMode()}
				aria-label={multiSelect.selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
			>
				{multiSelect.selectionMode ? 'Cancel' : 'Select'}
			</Button>
		</div>
		<!-- Five columns: 4 houses + unassigned -->
		<div class="houses-board grid grid-cols-1 items-start gap-3 md:grid-cols-5">
			<!-- Four Houses Grid -->
			{#each HOUSES as house (house)}
				{@const students = housesData[house] || []}
				{@const colors = HOUSE_COLORS[house]}
				{@const isDragOver = dragState.activeDropZoneId === house}
				{@const Logo = houseLogos[house]}
				{@const groupedStudents = getGroupedStudents(students)}
				<div
					class={[
						'house-column flex min-h-0 flex-col rounded-lg transition-all',
						isDragOver && 'scale-[1.02] ring-2 ring-blue-500 ring-offset-2'
					]}
					role="region"
					aria-label="{house} House"
					use:dropZone={{
						id: house,
						accept: (data: DragData) => {
							const d = data as unknown as { sourceHouse: string };
							return d.sourceHouse !== house;
						},
						onDrop: (data: DragData) => {
							if (
								multiSelect.selectionMode &&
								multiSelect.selectedIds.has(data.id) &&
								multiSelect.selectedIds.size > 1
							) {
								const ids = Array.from(multiSelect.selectedIds) as Id<'students'>[];
								multiSelect.exitSelectionMode();
								for (const sid of ids) {
									assignHouse(sid, house);
								}
							} else {
								assignHouse(data.id as Id<'students'>, house);
							}
						}
					}}
				>
					<!-- House Header -->
					<div
						class={[
							`house-column__header flex cursor-pointer items-center justify-between px-3 py-2`,
							collapsedHouses.has(house) ? 'rounded-md' : 'rounded-t-md',
							colors.bg
						]}
						onclick={() => toggleCollapse(house)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && toggleCollapse(house)}
					>
						<div class="flex items-center gap-2">
							<div class="size-8 text-white">
								<Logo />
							</div>
							<h2 class="text-lg font-bold text-white">{house}</h2>
						</div>
						<div class="flex items-center gap-1 text-white">
							<Users class="size-4" />
							<span class="text-sm font-semibold">{students.length}</span>
							{#if collapsedHouses.has(house)}
								<ChevronRight class="size-4" />
							{:else}
								<ChevronDown class="size-4" />
							{/if}
						</div>
					</div>

					<!-- Student List -->
					{#if !collapsedHouses.has(house)}
						<div class={['house-column__body min-h-0 flex-1 rounded-b-md p-2', colors.lightBg]}>
							{#if students.length > 0}
								<div class="house-column__groups flex flex-col gap-1">
									{#each groupedStudents as group (group.className)}
										<div class="flex flex-col gap-1">
											<!-- Class Header -->
											<div class="house-group__header flex items-center gap-2 px-2 py-1">
												<span
													class={[
														'rounded-full bg-white px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] uppercase',
														colors.text
													]}
												>
													{group.className}
												</span>
												<span class={['text-xs font-medium', colors.text]}>
													{group.students.length}
												</span>
											</div>
											{#each group.students as student (student._id)}
												<StudentCard
													{student}
													sourceHouse={house}
													{multiSelect}
													onOpenDialog={(s) => openMoveDialog(s, house)}
												/>
											{/each}
										</div>
									{/each}
								</div>
							{:else}
								<div
									class="text-muted-foreground flex h-24 items-center justify-center text-sm italic"
								>
									No students assigned
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}

			<!-- Unassigned Students Column -->
			<div
				class={[
					'house-column house-column--orphaned flex min-h-0 flex-col rounded-lg transition-all',
					dragState.activeDropZoneId === '__orphaned' && 'ring-2 ring-blue-500 ring-offset-2'
				]}
				role="region"
				aria-label="Unassigned Students"
				use:dropZone={{
					id: '__orphaned',
					accept: (data: DragData) => {
						const d = data as unknown as { sourceHouse: string };
						return d.sourceHouse !== 'orphaned';
					},
					onDrop: (data: DragData) => {
						if (
							multiSelect.selectionMode &&
							multiSelect.selectedIds.has(data.id) &&
							multiSelect.selectedIds.size > 1
						) {
							const ids = Array.from(multiSelect.selectedIds) as Id<'students'>[];
							multiSelect.exitSelectionMode();
							for (const sid of ids) {
								assignHouse(sid, undefined);
							}
						} else {
							assignHouse(data.id as Id<'students'>, undefined);
						}
					}
				}}
			>
				<!-- Unassigned Header -->
				<div
					class={[
						'house-column__header flex cursor-pointer items-center justify-between px-3 py-2',
						collapsedHouses.has('__orphaned') ? 'rounded-md' : 'rounded-t-md',
						'bg-gray-400'
					]}
					onclick={() => toggleCollapse('__orphaned')}
					role="button"
					tabindex="0"
					onkeydown={(e) => e.key === 'Enter' && toggleCollapse('__orphaned')}
				>
					<div class="flex items-center gap-2">
						<h2 class="text-lg font-bold text-white">Unassigned</h2>
					</div>
					<div class="flex items-center gap-1 text-white">
						<Users class="size-4" />
						<span class="text-sm font-semibold">{orphanedStudents.length}</span>
						{#if collapsedHouses.has('__orphaned')}
							<ChevronRight class="size-4" />
						{:else}
							<ChevronDown class="size-4" />
						{/if}
					</div>
				</div>

				<!-- Unassigned Student List -->
				{#if !collapsedHouses.has('__orphaned')}
					<div class="house-column__body min-h-0 flex-1 rounded-b-md bg-gray-50 p-2">
						{#if orphanedStudents.length > 0}
							{@const groupedOrphaned = getGroupedStudents(orphanedStudents)}
							<div class="house-column__groups flex flex-col gap-1">
								{#each groupedOrphaned as group (group.className)}
									<div class="flex flex-col gap-1">
										<!-- Class Header -->
										<div class="house-group__header flex items-center gap-2 px-2 py-1">
											<span
												class="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-gray-600 uppercase"
											>
												{group.className}
											</span>
											<span class="text-xs font-medium text-gray-500">{group.students.length}</span>
										</div>
										{#each group.students as student (student._id)}
											<StudentCard
												{student}
												sourceHouse="orphaned"
												{multiSelect}
												onOpenDialog={(s) => openMoveDialog(s, 'orphaned')}
											/>
										{/each}
									</div>
								{/each}
							</div>
						{:else}
							<div
								class="text-muted-foreground flex h-24 items-center justify-center text-sm italic"
							>
								All students assigned
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
		{#if multiSelect.selectedCount > 0}
			<div class="h-64 md:hidden" aria-hidden="true"></div>
		{/if}
	{/if}
</div>

<div class="md:hidden">
	<BulkActionBar
		selectedCount={multiSelect.selectedCount}
		actions={bulkActions}
		onDone={() => multiSelect.exitSelectionMode()}
	/>
</div>

<MoveDialog
	open={!!moveDialogStudent}
	onClose={closeMoveDialog}
	title={moveDialogStudent ? `Move ${moveDialogStudent.englishName}` : ''}
	subtitle={moveDialogStudent
		? `Currently in ${moveDialogStudent.sourceHouse === 'orphaned' ? 'Unassigned' : moveDialogStudent.sourceHouse}`
		: ''}
	targets={(() => {
		if (!moveDialogStudent) return [];
		const student = moveDialogStudent;
		const houseTargets = HOUSES.filter((h) => h !== student.sourceHouse).map((house) => ({
			label: house,
			action: () => {
				assignHouse(student._id, house);
				closeMoveDialog();
			},
			color:
				HOUSE_COLORS[house].lightBg +
				' ' +
				HOUSE_COLORS[house].text +
				' hover:' +
				HOUSE_COLORS[house].lightBg.replace('50', '100')
		}));

		const unassignedTarget =
			student.sourceHouse !== 'orphaned'
				? [
						{
							label: 'Unassigned',
							action: () => {
								assignHouse(student._id, undefined);
								closeMoveDialog();
							},
							color: 'bg-gray-50 text-gray-700 hover:bg-gray-100'
						}
					]
				: [];

		return [...houseTargets, ...unassignedTarget];
	})()}
/>

<style>
	.houses-board {
		--app-header-height: 3.5rem;
		--sticky-gap: 0.75rem;
		--sticky-offset: calc(var(--app-header-height) + var(--sticky-gap));
	}

	.house-column__header {
		transition:
			box-shadow 180ms ease,
			background-color 180ms ease,
			border-color 180ms ease;
	}

	@media (min-width: 768px) {
		.house-column__header {
			position: sticky;
			top: var(--sticky-offset);
			z-index: 20;
			isolation: isolate;
		}

		.house-column__header::before {
			content: '';
			position: absolute;
			right: 0;
			bottom: 100%;
			left: 0;
			height: var(--sticky-gap);
			background: var(--background);
			pointer-events: none;
		}

		.house-column--orphaned {
			position: sticky;
			top: var(--sticky-offset);
			align-self: start;
			z-index: 30;
			isolation: isolate;
		}

		.house-column--orphaned::before {
			content: '';
			position: absolute;
			right: 0;
			bottom: 100%;
			left: 0;
			height: var(--sticky-gap);
			background: var(--background);
			pointer-events: none;
		}

		.house-column--orphaned .house-column__header {
			top: 0;
		}
	}
</style>
