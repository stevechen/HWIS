<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { GripVertical, Users } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	// Import house logos
	import LogoHeracles from '$lib/components/LogoHeracles.svelte';
	import LogoWukong from '$lib/components/LogoWukong.svelte';
	import LogoIxbalam from '$lib/components/LogoIxbalam.svelte';
	import LogoSetna from '$lib/components/LogoSetna.svelte';

	const HOUSES = ['Heracles', 'Wukong', 'Ixbalam', 'Setna'] as const;
	type House = (typeof HOUSES)[number];

	// House colors for theming
	const houseColors: Record<House, { bg: string; border: string; text: string; lightBg: string }> =
		{
			Heracles: {
				bg: 'bg-red-600',
				border: 'border-red-600',
				text: 'text-red-700',
				lightBg: 'bg-red-50'
			},
			Wukong: {
				bg: 'bg-amber-600',
				border: 'border-amber-600',
				text: 'text-amber-700',
				lightBg: 'bg-amber-50'
			},
			Ixbalam: {
				bg: 'bg-emerald-600',
				border: 'border-emerald-600',
				text: 'text-emerald-700',
				lightBg: 'bg-emerald-50'
			},
			Setna: {
				bg: 'bg-blue-600',
				border: 'border-blue-600',
				text: 'text-blue-700',
				lightBg: 'bg-blue-50'
			}
		};

	// House logos mapping
	const houseLogos: Record<House, typeof LogoHeracles> = {
		Heracles: LogoHeracles,
		Wukong: LogoWukong,
		Ixbalam: LogoIxbalam,
		Setna: LogoSetna
	};

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

	// Drag and drop state
	let draggedStudent = $state<{
		id: string;
		name: string;
		sourceHouse: House | 'orphaned';
	} | null>(null);
	let dragOverHouse = $state<House | null>(null);

	// Get students data
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

	// Drag and drop handlers
	function handleDragStart(
		e: DragEvent,
		student: { _id: string; englishName: string },
		sourceHouse: House | 'orphaned'
	) {
		draggedStudent = { id: student._id, name: student.englishName, sourceHouse };
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', student._id);
		}
	}

	function handleDragEnd() {
		draggedStudent = null;
		dragOverHouse = null;
	}

	function handleDragOver(e: DragEvent, targetHouse: House) {
		e.preventDefault();
		if (!draggedStudent) return;
		if (draggedStudent.sourceHouse !== targetHouse) {
			dragOverHouse = targetHouse;
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
		}
	}

	function handleDragLeave() {
		dragOverHouse = null;
	}

	async function handleDrop(e: DragEvent, targetHouse: House) {
		e.preventDefault();
		dragOverHouse = null;

		if (!draggedStudent) return;
		if (draggedStudent.sourceHouse === targetHouse) {
			draggedStudent = null;
			return;
		}

		try {
			await client.mutation(api.students.assignHouse, {
				studentId: draggedStudent.id as Id<'students'>,
				house: targetHouse
			});
			// Convex reactivity will automatically update the UI
		} catch (err) {
			window.alert(err instanceof Error ? err.message : 'Failed to assign house');
		}

		draggedStudent = null;
	}

	async function handleRemoveFromHouse(e: DragEvent) {
		e.preventDefault();
		dragOverHouse = null;

		if (!draggedStudent || draggedStudent.sourceHouse === 'orphaned') {
			draggedStudent = null;
			return;
		}

		try {
			await client.mutation(api.students.assignHouse, {
				studentId: draggedStudent.id as Id<'students'>,
				house: undefined
			});
			// Convex reactivity will automatically update the UI
		} catch (err) {
			window.alert(err instanceof Error ? err.message : 'Failed to remove from house');
		}

		draggedStudent = null;
	}

	function handleDragOverOrphaned(e: DragEvent) {
		e.preventDefault();
		if (!draggedStudent || draggedStudent.sourceHouse === 'orphaned') return;
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
	}
</script>

<div class="space-y-4">
	<!-- Instructions -->
	<p class="text-muted-foreground text-sm">
		Drag and drop students between houses. Students without a house are shown in the "Unassigned"
		section.
	</p>

	{#if housesQuery.isLoading}
		<div class="py-8 text-muted-foreground text-center">Loading houses...</div>
	{:else if housesQuery.error}
		<div class="py-8 text-red-500 text-center">Error loading houses</div>
	{:else}
		<div class="gap-4 grid grid-cols-1 md:grid-cols-4">
			<!-- Four Houses Grid -->
			{#each HOUSES as house (house)}
				{@const students = housesData[house] || []}
				{@const colors = houseColors[house]}
				{@const isDragOver = dragOverHouse === house}
				{@const Logo = houseLogos[house]}
				<div
					class={[
						'flex flex-col rounded-lg border-2 transition-all',
						colors.border,
						isDragOver && 'scale-[1.02] ring-2 ring-blue-500 ring-offset-2'
					]}
					role="region"
					aria-label="{house} House"
					ondragover={(e) => handleDragOver(e, house)}
					ondragleave={handleDragLeave}
					ondrop={(e) => handleDrop(e, house)}
				>
					<!-- House Header -->
					<div class={['flex items-center justify-between rounded-t-md px-4 py-3', colors.bg]}>
						<div class="flex items-center gap-3">
							<div class="size-10 text-white">
								<Logo />
							</div>
							<h2 class="font-bold text-white text-xl">{house}</h2>
						</div>
						<div class="flex items-center gap-2 text-white">
							<Users class="size-4" />
							<span class="font-semibold">{students.length}</span>
						</div>
					</div>

					<!-- Student List -->
					<div class={['flex-1 rounded-b-md p-2', colors.lightBg]}>
						{#if students.length > 0}
							<div class="flex flex-col gap-1 max-h-100 overflow-y-auto">
								{#each students as student (student._id)}
									{@const enrolled = student.status !== 'Not Enrolled'}
									<div
										class={[
											'flex cursor-grab items-center gap-2 rounded border bg-white px-2 py-1.5 text-sm shadow-sm transition-colors hover:bg-gray-50 active:cursor-grabbing',
											!enrolled && 'text-muted-foreground bg-gray-100'
										]}
										draggable="true"
										ondragstart={(e) => handleDragStart(e, student, house)}
										ondragend={handleDragEnd}
										role="button"
										aria-label="Drag {student.englishName} to move to another house"
										tabindex="0"
									>
										<GripVertical class="size-3 text-gray-400 shrink-0" />
										<div class="flex flex-col flex-1 min-w-0">
											<span class="font-medium truncate">{student.englishName}</span>
											<span class="text-muted-foreground text-xs">
												{student.classDisplay}
												{#if !enrolled}
													• Not Enrolled
												{/if}
											</span>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div
								class="flex justify-center items-center h-32 text-muted-foreground text-sm italic"
							>
								No students assigned
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Orphaned Students Section -->
		{@const orphanedStudents = housesData.orphaned || []}
		<div
			class="bg-gray-50 mt-6 p-4 border-2 border-gray-300 border-dashed rounded-lg"
			role="region"
			aria-label="Unassigned Students"
			ondragover={handleDragOverOrphaned}
			ondrop={handleRemoveFromHouse}
		>
			<div class="flex justify-between items-center mb-3">
				<h3 class="font-semibold text-gray-700">Unassigned Students</h3>
				<span class="text-muted-foreground text-sm">{orphanedStudents.length} students</span>
			</div>

			{#if orphanedStudents.length > 0}
				<div class="gap-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
					{#each orphanedStudents as student (student._id)}
						{@const enrolled = student.status !== 'Not Enrolled'}
						<div
							class={[
								'flex cursor-grab items-center gap-2 rounded border bg-white px-2 py-1.5 text-sm shadow-sm transition-colors hover:bg-gray-50 active:cursor-grabbing',
								!enrolled && 'text-muted-foreground bg-gray-100'
							]}
							draggable="true"
							ondragstart={(e) => handleDragStart(e, student, 'orphaned')}
							ondragend={handleDragEnd}
							role="button"
							aria-label="Drag {student.englishName} to assign to a house"
							tabindex="0"
						>
							<GripVertical class="size-3 text-gray-400 shrink-0" />
							<div class="flex flex-col flex-1 min-w-0">
								<span class="font-medium truncate">{student.englishName}</span>
								<span class="text-muted-foreground text-xs">
									{student.classDisplay}
									{#if !enrolled}
										• Not Enrolled
									{/if}
								</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="py-8 text-gray-500 text-center italic">All students are assigned to houses</div>
			{/if}

			<p class="mt-3 text-muted-foreground text-xs text-center">
				Drag students from houses here to unassign them
			</p>
		</div>
	{/if}
</div>
