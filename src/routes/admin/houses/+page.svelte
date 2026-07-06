<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { GripVertical, Users } from '@lucide/svelte';
	import { draggable, dropZone, dragState } from '$lib/utils/dnd.svelte';
	import type { DragData } from '$lib/utils/dnd.svelte';

	// Import house logos
	import LogoHeracles from '$lib/components/LogoHeracles.svelte';
	import LogoWukong from '$lib/components/LogoWukong.svelte';
	import LogoIxbalam from '$lib/components/LogoIxbalam.svelte';
	import LogoSetna from '$lib/components/LogoSetna.svelte';

	const HOUSES = ['Heracles', 'Wukong', 'Ixbalam', 'Setna'] as const;
	type House = (typeof HOUSES)[number];

	// House colors for theming
	const houseColors: Record<House, { bg: string; text: string; lightBg: string }> = {
		Heracles: {
			bg: 'bg-red-600',
			text: 'text-red-700',
			lightBg: 'bg-red-50'
		},
		Wukong: {
			bg: 'bg-amber-600',
			text: 'text-amber-700',
			lightBg: 'bg-amber-50'
		},
		Ixbalam: {
			bg: 'bg-emerald-600',
			text: 'text-emerald-700',
			lightBg: 'bg-emerald-50'
		},
		Setna: {
			bg: 'bg-blue-600',
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
</script>

<div class="space-y-4 p-4">
	{#if housesQuery.isLoading}
		<div class="text-muted-foreground py-8 text-center">Loading houses...</div>
	{:else if housesQuery.error}
		<div class="py-8 text-center text-red-500">Error loading houses</div>
	{:else}
		<p class="text-muted-foreground text-sm">
			Drag and drop students between houses to manage assignments.
		</p>
		<!-- Five columns: 4 houses + unassigned -->
		<div class="houses-board grid grid-cols-1 items-start gap-3 md:grid-cols-5">
			<!-- Four Houses Grid -->
			{#each HOUSES as house (house)}
				{@const students = housesData[house] || []}
				{@const colors = houseColors[house]}
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
							assignHouse(data.id as Id<'students'>, house);
						}
					}}
				>
					<!-- House Header -->
					<div
						class={[
							'house-column__header flex items-center justify-between rounded-t-md px-3 py-2',
							colors.bg
						]}
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
						</div>
					</div>

					<!-- Student List -->
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
											{@const enrolled = student.status !== 'Not Enrolled'}
											<div
												class={[
													'flex items-center gap-2 rounded border bg-white px-2 py-1 text-sm shadow-sm transition-colors hover:bg-gray-50',
													!enrolled && 'text-muted-foreground bg-gray-100'
												]}
											>
												<div
													use:draggable={{
														data: {
															id: student._id,
															englishName: student.englishName,
															sourceHouse: house
														},
														label: student.englishName
													}}
													class="flex min-w-0 flex-1 items-center gap-2"
													role="button"
													aria-label="Drag {student.englishName} to move to another house"
													tabindex="0"
												>
													<GripVertical class="size-3 shrink-0 text-gray-400" />
													<div class="flex min-w-0 flex-1 flex-col">
														<span class="truncate font-medium">{student.englishName}</span>
														{#if !enrolled}
															<span class="text-muted-foreground text-xs">Not Enrolled</span>
														{/if}
													</div>
												</div>
												<select
													class="h-5 max-w-14 rounded border border-gray-200 bg-gray-50 px-1 text-[10px] md:hidden"
													onchange={(e) => {
														const val = (e.currentTarget as HTMLSelectElement).value;
														if (val === '__unassign') {
															assignHouse(student._id as Id<'students'>, undefined);
														} else if (val) {
															assignHouse(student._id as Id<'students'>, val as House);
														}
														(e.currentTarget as HTMLSelectElement).value = '';
													}}
													onpointerdown={(e) => e.stopPropagation()}
													aria-label="Move student to another house"
												>
													<option value="">Move...</option>
													{#each HOUSES.filter((h) => h !== house) as targetHouse (targetHouse)}
														<option value={targetHouse}>{targetHouse}</option>
													{/each}
													<option value="__unassign">Unassigned</option>
												</select>
											</div>
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
						assignHouse(data.id as Id<'students'>, undefined);
					}
				}}
			>
				<!-- Unassigned Header -->
				<div
					class="house-column__header flex items-center justify-between rounded-t-md bg-gray-400 px-3 py-2"
				>
					<div class="flex items-center gap-2">
						<h2 class="text-lg font-bold text-white">Unassigned</h2>
					</div>
					<div class="flex items-center gap-1 text-white">
						<Users class="size-4" />
						<span class="text-sm font-semibold">{orphanedStudents.length}</span>
					</div>
				</div>

				<!-- Unassigned Student List -->
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
										{@const enrolled = student.status !== 'Not Enrolled'}
										<div
											class={[
												'flex items-center gap-2 rounded border bg-white px-2 py-1 text-sm shadow-sm transition-colors hover:bg-gray-50',
												!enrolled && 'text-muted-foreground bg-gray-100'
											]}
										>
											<div
												use:draggable={{
													data: {
														id: student._id,
														englishName: student.englishName,
														sourceHouse: 'orphaned'
													},
													label: student.englishName
												}}
												class="flex min-w-0 flex-1 items-center gap-2"
												role="button"
												aria-label="Drag {student.englishName} to assign to a house"
												tabindex="0"
											>
												<GripVertical class="size-3 shrink-0 text-gray-400" />
												<div class="flex min-w-0 flex-1 flex-col">
													<span class="truncate font-medium">{student.englishName}</span>
													{#if !enrolled}
														<span class="text-muted-foreground text-xs">Not Enrolled</span>
													{/if}
												</div>
											</div>
											<select
												class="h-5 max-w-14 rounded border border-gray-200 bg-gray-50 px-1 text-[10px] md:hidden"
												onchange={(e) => {
													const val = (e.currentTarget as HTMLSelectElement).value;
													if (val) {
														assignHouse(student._id as Id<'students'>, val as House);
													}
													(e.currentTarget as HTMLSelectElement).value = '';
												}}
												onpointerdown={(e) => e.stopPropagation()}
												aria-label="Assign student to a house"
											>
												<option value="">Move...</option>
												{#each HOUSES as house (house)}
													<option value={house}>{house}</option>
												{/each}
											</select>
										</div>
									{/each}
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-muted-foreground flex h-24 items-center justify-center text-sm italic">
							All students assigned
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

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
