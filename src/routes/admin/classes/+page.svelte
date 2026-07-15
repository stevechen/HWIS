<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import {
		Plus,
		Trash2,
		Users,
		GripVertical,
		ChevronDown,
		ChevronRight,
		MousePointer2,
		MousePointerClick
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { SvelteSet } from 'svelte/reactivity';
	import { onMount } from 'svelte';
	import { createMultiSelectState } from '$lib/utils/multiSelect.svelte';
	import BulkActionBar from '$lib/components/BulkActionBar.svelte';
	import MoveDialog from '$lib/components/MoveDialog.svelte';
	import { draggable, dropZone, dragState } from '$lib/utils/dnd.svelte';
	import type { DragData } from '$lib/utils/dnd.svelte';

	// Client-side helper functions (duplicated from classes.ts for client use)
	function getDisplayName(grade: number, className: string): string {
		if (className === 'default') return `${grade}`;
		if (className === 'IB') return `${grade}-IB`;
		return `${grade}-${className}`;
	}

	function isProtectedClass(className: string): boolean {
		return className === '1' || className === 'IB';
	}

	// Grade base hues (HSL) - G7=red, G8=orange, G9=yellow, G10=green, G11=blue, G12=purple
	const gradeBaseHues: Record<number, number> = {
		7: 25, // Red
		8: 55, // Orange
		9: 85, // Yellow/Gold
		10: 145, // Green
		11: 250, // Blue
		12: 310 // Purple
	};

	// Tailwind color classes for each grade (used in MoveDialog buttons)
	const gradeColorClasses: Record<number, string> = {
		7: 'bg-red-50 text-red-700 hover:bg-red-100',
		8: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
		9: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
		10: 'bg-green-50 text-green-700 hover:bg-green-100',
		11: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
		12: 'bg-purple-50 text-purple-700 hover:bg-purple-100'
	};

	// Get OKLCH color string for a class based on grade and position in gradient
	// 1, 2, 3... are brightest first, IB is last and lightest
	function getClassColor(grade: number, className: string, totalClasses: number): string {
		const baseHue = gradeBaseHues[grade] ?? 0;

		// Determine position in gradient: 1 is first (0), then 2, 3..., IB is last
		let position: number;
		if (className === 'IB') {
			position = totalClasses - 1; // Last position (lightest)
		} else if (className === 'default') {
			position = 0;
		} else {
			// Parse number from class name (e.g., "1", "2", "3")
			const num = parseInt(className, 10);
			position = isNaN(num) ? 0 : num - 1; // 1 -> 0, 2 -> 1, etc.
		}

		// Calculate lightness and chroma based on position
		// Position 0 (class 1): 75% lightness, 0.15 chroma (brightest/most saturated)
		// Each subsequent class: +4% lightness, -0.02 chroma
		const chroma = Math.max(0.05, 0.15 - position * 0.02);
		const lightness = Math.min(95, 75 + position * 4);

		return `oklch(${lightness}% ${chroma} ${baseHue})`;
	}

	// Get background color class for class card (using inline style for HSL)
	function getClassBackgroundStyle(grade: number, className: string, totalClasses: number): string {
		return getClassColor(grade, className, totalClasses);
	}

	// Get lighter background for student list using OKLCH
	function getStudentListBackgroundStyle(
		grade: number,
		className: string,
		totalClasses: number
	): string {
		const baseHue = gradeBaseHues[grade] ?? 0;

		let position: number;
		if (className === 'IB') {
			position = totalClasses - 1; // Last position (lightest)
		} else if (className === 'default') {
			position = 0;
		} else {
			const num = parseInt(className, 10);
			position = isNaN(num) ? 0 : num - 1; // 1 -> 0, 2 -> 1, etc.
		}

		// Student list is lighter than class card
		const chroma = Math.max(0.03, 0.12 - position * 0.015);
		const lightness = Math.min(98, 88 + position * 6);

		return `oklch(${lightness}% ${chroma} ${baseHue})`;
	}

	type Student = {
		_id: Id<'students'>;
		name: string;
		studentId: string;
		status: 'Enrolled' | 'Not Enrolled';
	};

	type ClassRecord = {
		_id: Id<'classes'>;
		_creationTime: number;
		grade: number;
		class: string;
		homeroomTeacherId?: Id<'users'>;
		homeroomTeacherName?: string | null;
		studentCount: number;
		students: Student[];
	};

	// Use includeStudents to get student data per class
	const classesQuery = useQuery(api.classes.list, () => ({ includeStudents: true }));
	const teachersQuery = useQuery(api.users.getTeachers, () => ({}));
	const client = useConvexClient();

	// Automatically seed default classes (G#-1 and G#-IB) when page loads
	onMount(async () => {
		try {
			await client.mutation(api.classes.seedDefaultClasses, {});
		} catch {
			// Ignore errors - classes may already exist
		}
	});

	// Collapse all classes by default on mobile (touch device + small viewport)
	let hasCollapsedOnMobile = $state(false);
	$effect(() => {
		const data = classesQuery.data;
		if (
			data &&
			data.length > 0 &&
			!hasCollapsedOnMobile &&
			window.innerWidth < 768 &&
			window.matchMedia('(hover: none)').matches
		) {
			for (const c of data) {
				collapsedClasses.add(c._id);
			}
			hasCollapsedOnMobile = true;
		}
	});

	async function moveStudent(studentId: Id<'students'>, targetClassId: Id<'classes'>) {
		try {
			await client.mutation(api.classes.moveStudent, { studentId, targetClassId });
		} catch (e) {
			window.alert(e instanceof Error ? e.message : 'Failed to move student');
		}
	}

	let multiSelect = createMultiSelectState();

	let bulkClassActions = $derived.by(() => {
		if (selectedSelectGrade === null) return [] as { label: string; action: () => void }[];
		const selected = multiSelect.selectedIds;
		if (selected.size === 0) return [] as { label: string; action: () => void }[];

		const sourceClassIds = new SvelteSet<string>();
		for (const cls of classesQuery.data || []) {
			for (const student of cls.students) {
				if (selected.has(student._id)) {
					sourceClassIds.add(cls._id);
				}
			}
		}

		const isSingleSource = sourceClassIds.size === 1;

		const actions: { label: string; action: () => void }[] = [];
		for (const cls of classesByGrade[selectedSelectGrade] || []) {
			if (isSingleSource && sourceClassIds.has(cls._id)) continue;
			if (cls.class === 'IB' && selectedSelectGrade < 11) continue;
			const displayName = getDisplayName(cls.grade, cls.class);
			actions.push({
				label: displayName,
				action: async () => {
					const ids = Array.from(multiSelect.selectedIds) as Id<'students'>[];
					let moved = 0;
					for (const sId of ids) {
						const studentClass = (classesQuery.data || []).find((c) =>
							c.students.some((s) => s._id === sId)
						);
						if (studentClass && studentClass.grade === cls.grade) {
							try {
								await moveStudent(sId, cls._id as Id<'classes'>);
								moved++;
							} catch {
								// skip individual failures
							}
						}
					}
					exitGradeSelection();
					if (moved < ids.length) {
						window.alert(
							`Moved ${moved} of ${ids.length} students. ${ids.length - moved} student${ids.length - moved !== 1 ? 's' : ''} from other grades were skipped.`
						);
					}
				}
			});
		}

		return actions;
	});

	// Accordion state
	let collapsedClasses = new SvelteSet<string>();

	function toggleCollapse(name: string) {
		if (collapsedClasses.has(name)) {
			collapsedClasses.delete(name);
		} else {
			collapsedClasses.add(name);
		}
	}

	// Move dialog state
	let moveDialogStudent = $state<{
		id: Id<'students'>;
		name: string;
		grade: number;
		classId: Id<'classes'>;
	} | null>(null);

	function openMoveDialog(student: Student, cls: ClassRecord) {
		moveDialogStudent = {
			id: student._id,
			name: student.name,
			grade: cls.grade,
			classId: cls._id
		};
	}

	function closeMoveDialog() {
		moveDialogStudent = null;
	}

	// State for visible grades (default only grade 7 visible)
	let visibleGrades = new SvelteSet([7]);

	// State for IB visibility per grade (grades where IB classes should be shown)
	let ibVisibleGrades = new SvelteSet();

	// State for which grade is in selection mode (null = none active)
	let selectedSelectGrade = $state<number | null>(null);

	// Add dialog state
	let addDialogRef = $state<HTMLDialogElement | null>(null);
	let addGrade = $state<number | null>(null);
	let addError = $state('');
	let isAdding = $state(false);

	// Warning dialog state
	let warningDialogRef = $state<HTMLDialogElement | null>(null);
	let warningClass = $state<ClassRecord | null>(null);

	// Cross-grade drag warning dialog
	let crossGradeDialogRef = $state<HTMLDialogElement | null>(null);
	let crossGradeErrorMessage = $state('');

	const grades = [7, 8, 9, 10, 11, 12];

	// Group classes by grade with IB-first gradient sorting
	const classesByGrade = $derived.by(() => {
		const classes = classesQuery.data || [];
		const grouped: Record<number, ClassRecord[]> = {};
		for (const grade of grades) {
			const gradeClasses = classes.filter((c) => c.grade === grade);
			grouped[grade] = gradeClasses.sort((a, b) => {
				// Gradient sort: 1, 2, 3... first (brightest to lighter), IB last (lightest)
				// default class comes after IB but before numbered classes
				const getSortPriority = (className: string): number => {
					if (className === 'IB') return 999; // Last (lightest color)
					if (className === 'default') return 0;
					const num = parseInt(className, 10);
					return isNaN(num) ? 998 : num; // 1 -> 1, 2 -> 2, etc.
				};
				return getSortPriority(a.class) - getSortPriority(b.class);
			});
		}
		return grouped;
	});

	// Get teachers
	const teachers = $derived.by(() => {
		return teachersQuery.data || [];
	});

	// Check if IB class for a grade has students
	function hasIBStudents(grade: number): boolean {
		const gradeClasses = classesByGrade[grade] || [];
		const ibClass = gradeClasses.find((c) => c.class === 'IB');
		return ibClass ? ibClass.studentCount > 0 : false;
	}

	// Toggle grade visibility
	function toggleGradeVisibility(grade: number) {
		if (visibleGrades.has(grade)) {
			visibleGrades.delete(grade);
		} else {
			visibleGrades.add(grade);
		}
	}

	// Toggle IB visibility for a grade
	function toggleIBVisibility(grade: number) {
		if (ibVisibleGrades.has(grade)) {
			ibVisibleGrades.delete(grade);
		} else {
			ibVisibleGrades.add(grade);
		}
	}

	function exitGradeSelection() {
		multiSelect.clearSelection();
		selectedSelectGrade = null;
	}

	function toggleGradeSelect(grade: number) {
		if (selectedSelectGrade === grade) {
			exitGradeSelection();
		} else {
			multiSelect.clearSelection();
			selectedSelectGrade = grade;
		}
	}

	function openAddDialog(grade: number) {
		addGrade = grade;
		addError = '';
		isAdding = false;
		addDialogRef?.showModal();
	}

	function closeAddDialog() {
		addDialogRef?.close();
		addGrade = null;
		addError = '';
	}

	async function handleAdd() {
		if (!addGrade) {
			addError = 'Grade is required';
			return;
		}

		isAdding = true;
		addError = '';

		try {
			// Auto-increment: pass undefined for class name
			await client.mutation(api.classes.create, {
				grade: addGrade,
				homeroomTeacherId: undefined
			});
			closeAddDialog();
		} catch (e) {
			addError = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			isAdding = false;
		}
	}

	async function updateTeacher(cls: ClassRecord, teacherId: string | undefined) {
		try {
			await client.mutation(api.classes.update, {
				id: cls._id,
				homeroomTeacherId: teacherId ? (teacherId as Id<'users'>) : undefined
			});
		} catch {
			// Handle error
		}
	}

	async function deleteClass(cls: ClassRecord) {
		if (isProtectedClass(cls.class)) {
			window.alert(
				`Cannot delete protected class ${getDisplayName(cls.grade, cls.class)}: ${cls.class === 'default' ? 'default' : 'IB'} classes are required`
			);
			return;
		}

		if (cls.studentCount > 0) {
			warningClass = cls;
			warningDialogRef?.showModal();
			return;
		}

		// No students, confirm delete
		warningClass = cls;
		warningDialogRef?.showModal();
	}

	async function confirmDelete() {
		if (!warningClass) return;
		try {
			await client.mutation(api.classes.remove, { id: warningClass._id });
			warningDialogRef?.close();
			warningClass = null;
		} catch (e) {
			window.alert(e instanceof Error ? e.message : 'Failed to delete class');
		}
	}
</script>

<div class="space-y-2">
	<!-- Top Control Bar -->
	<div
		class="bg-muted/50 flex flex-wrap items-center gap-3 rounded-sm border px-3 py-2 max-md:flex-nowrap max-md:overflow-x-auto"
	>
		<!-- Grade Checkboxes -->
		<div class="flex items-center gap-2 max-md:flex-nowrap max-md:gap-3">
			<span class="text-muted-foreground mr-1 text-xs max-md:text-sm">Show Grades:</span>
			{#each grades as grade (grade)}
				<label class="flex cursor-pointer items-center gap-1 max-md:gap-1.5">
					<input
						type="checkbox"
						checked={visibleGrades.has(grade)}
						onchange={() => toggleGradeVisibility(grade)}
						class="size-3 max-md:size-5"
					/>
					<span class="text-xs max-md:text-base">{grade}</span>
				</label>
			{/each}
		</div>
	</div>

	{#if classesQuery.isLoading}
		<div class="text-muted-foreground py-4 text-center text-sm">Loading classes...</div>
	{:else if classesQuery.error}
		<div class="py-4 text-center text-sm text-red-500">Error loading classes</div>
	{:else}
		<div class="flex flex-col gap-2 md:flex-row md:flex-wrap md:gap-0">
			{#each grades as grade (grade)}
				{@const gradeClasses = classesByGrade[grade] || []}
				{@const totalStudents = gradeClasses.reduce((sum, c) => sum + c.studentCount, 0)}
				{@const isGradeVisible = visibleGrades.has(grade)}
				{@const ibHasStudents = hasIBStudents(grade)}
				{@const shouldShowIB = ibHasStudents || ibVisibleGrades.has(grade)}
				{#if isGradeVisible}
					<div class="w-full border-0 border-gray-200 md:w-auto">
						<!-- Grade Header -->
						<div
							class="bg-muted/30 last-border-r-none flex items-center justify-between border-r border-b border-r-gray-300 px-1 py-0.5"
						>
							<div class="flex items-center gap-1">
								<span class="text-sm font-semibold">G{grade}</span>
								<Users class="ml-2 size-3" /><span class="text-muted-foreground text-xs"
									>{totalStudents}</span
								>
								{#if totalStudents > 0}
									<!-- Select/Done Button -->
									<Button
										variant={selectedSelectGrade === grade ? 'default' : 'outline'}
										size="icon"
										class="size-5 shrink-0 rounded-none"
										onclick={() => toggleGradeSelect(grade)}
										aria-label={selectedSelectGrade === grade
											? `Done selecting in grade ${grade}`
											: `Select grade ${grade}`}
									>
										{#if selectedSelectGrade === grade}
											<MousePointer2 class="size-3.5" />
										{:else}
											<MousePointerClick class="size-3.5" />
										{/if}
									</Button>
								{/if}
							</div>
							<div class="flex items-center gap-0">
								<!-- IB Toggle Button (grades 11-12 only, IB-DP program) -->
								{#if grade >= 11 && !ibHasStudents}
									<Button
										variant="outline"
										size="icon"
										class="size-5 shrink-0 rounded-none"
										onclick={() => toggleIBVisibility(grade)}
										aria-label={shouldShowIB ? 'Hide IB classes' : 'Show IB classes'}
										title={shouldShowIB ? 'Hide IB classes' : 'Show IB classes'}
									>
										<img
											src="/International_Baccalaureate_Logo.svg"
											alt="IB"
											class="size-3 shrink-0 {shouldShowIB ? 'opacity-100' : 'opacity-40'}"
										/>
									</Button>
								{/if}
								<!-- Add Class Button -->
								<Button
									variant="outline"
									size="icon"
									class="size-5 shrink-0 rounded-none"
									onclick={() => openAddDialog(grade)}
									aria-label="Add class to grade {grade}"
								>
									<Plus class="size-3" />
								</Button>
							</div>
						</div>

						<!-- Classes List -->
						<div class="flex flex-col gap-0 md:flex-row md:flex-wrap">
							{#each gradeClasses as cls (cls._id)}
								{@const isIBClass = cls.class === 'IB'}
								{@const shouldRenderClass = !isIBClass || shouldShowIB}
								{#if shouldRenderClass}
									{@const cardBg = getClassBackgroundStyle(
										cls.grade,
										cls.class,
										gradeClasses.length
									)}
									{@const studentListBg = getStudentListBackgroundStyle(
										cls.grade,
										cls.class,
										gradeClasses.length
									)}
									{@const isDragOver = dragState.activeDropZoneId === cls._id}
									<div
										class={[
											'border-b-none flex w-full flex-col gap-0 border-r p-0 transition-all md:min-w-25 md:flex-1',
											'max-md:rounded-lg max-md:border max-md:shadow-sm',
											isDragOver && 'scale-[1.02] ring-2 ring-blue-500 ring-inset'
										]}
										role="region"
										aria-label="Class {getDisplayName(cls.grade, cls.class)}"
										use:dropZone={{
											id: cls._id,
											accept: (data: DragData) => {
												const d = data as unknown as { sourceGrade: number; sourceClassId: string };
												return d.sourceGrade === cls.grade;
											},
											onDrop: (data: DragData) => {
												if (
													selectedSelectGrade !== null &&
													multiSelect.selectedIds.has(data.id) &&
													multiSelect.selectedIds.size > 1
												) {
													const ids = Array.from(multiSelect.selectedIds) as Id<'students'>[];
													exitGradeSelection();
													for (const sid of ids) {
														moveStudent(sid, cls._id);
													}
												} else {
													moveStudent(data.id as Id<'students'>, cls._id);
												}
											}
										}}
									>
										<!-- Class Header -->
										<div
											class={[
												'flex items-center px-2 py-1 max-md:px-3 max-md:py-2.5',
												collapsedClasses.has(cls._id) ? 'max-md:rounded-md' : 'max-md:rounded-t-md'
											]}
											style="background-color: {cardBg};"
										>
											<div
												class="flex flex-1 cursor-pointer items-center justify-between gap-1 max-md:gap-2"
												onclick={() => toggleCollapse(cls._id)}
												role="button"
												tabindex="0"
												onkeydown={(e) => e.key === 'Enter' && toggleCollapse(cls._id)}
											>
												<div class="flex items-center gap-1 max-md:gap-2">
													<!-- IB Logo for IB classes -->
													{#if isIBClass}
														<img
															src="/International_Baccalaureate_Logo.svg"
															alt="IB"
															class="size-3 shrink-0 max-md:size-4"
														/>
													{/if}

													<!-- Class Name -->
													<span class="text-sm font-semibold max-md:text-base">
														{getDisplayName(cls.grade, cls.class)}
													</span>

													<!-- Teacher Select (mobile inline) -->
													<select
														value={cls.homeroomTeacherId?.toString() || ''}
														onchange={(e: Event) => {
															e.stopPropagation();
															const target = e.target as HTMLSelectElement;
															updateTeacher(cls, target.value || undefined);
														}}
														onclick={(e) => e.stopPropagation()}
														aria-label="Teacher for {getDisplayName(cls.grade, cls.class)}"
														class="hidden cursor-pointer appearance-none rounded border border-current/20 bg-white/10 px-1.5 font-medium text-current opacity-80 hover:opacity-100 focus:outline-none max-md:inline-block max-md:h-8 max-md:max-h-8 max-md:text-base"
													>
														<option value="">- Teacher -</option>
														{#each teachers as teacher (teacher._id)}
															<option value={teacher._id}>
																{teacher.name}
															</option>
														{/each}
													</select>

													<!-- Student Count (inline with class name) -->
													<Users class="ml-1 size-3 max-md:size-4" /><span
														class="text-muted-foreground text-xs max-md:text-sm"
														>{cls.studentCount}</span
													>
												</div>

												<!-- Chevron -->
												{#if collapsedClasses.has(cls._id)}
													<ChevronRight class="size-3 shrink-0 opacity-60 max-md:size-4" />
												{:else}
													<ChevronDown class="size-3 shrink-0 opacity-60 max-md:size-4" />
												{/if}
											</div>

											<!-- Delete Button (only for non-protected classes) -->
											{#if !isProtectedClass(cls.class)}
												<Button
													variant="ghost"
													size="icon"
													class="size-4 shrink-0 rounded-none p-0 text-red-500 hover:text-red-600 max-md:size-6"
													onclick={() => deleteClass(cls)}
												>
													<Trash2 class="size-2.5 max-md:size-3.5" />
												</Button>
											{/if}
										</div>

										<!-- Teacher Dropdown (desktop only) -->
										<div class="px-1 pb-0.5 max-md:hidden">
											<NativeSelect.Root
												value={cls.homeroomTeacherId?.toString() || ''}
												onchange={(e: Event) => {
													const target = e.target as HTMLSelectElement;
													updateTeacher(cls, target.value || undefined);
												}}
												class="h-5 min-h-0 w-full rounded-none px-0 py-0 text-xs"
												aria-label="Teacher for {getDisplayName(cls.grade, cls.class)}"
											>
												<NativeSelect.Option value="">- No Teacher -</NativeSelect.Option>
												{#each teachers as teacher (teacher._id)}
													<NativeSelect.Option value={teacher._id}>
														{(teacher.name?.length ?? 0) > 10
															? teacher.name?.slice(0, 10) + '...'
															: teacher.name}
													</NativeSelect.Option>
												{/each}
											</NativeSelect.Root>
										</div>

										<!-- Student List (shown when global toggle is on and class is expanded) -->
										{#if !collapsedClasses.has(cls._id)}
											<div
												class="border-t text-center max-md:rounded-b-md max-md:p-3"
												style="background-color:{studentListBg}"
											>
												{#if cls.students && cls.students.length > 0}
													<div class="flex flex-col gap-0 overflow-y-auto max-md:gap-2">
														{#each [...cls.students].sort( (a, b) => a.name.localeCompare(b.name) ) as student (student._id)}
															{@const enrolled = student.status !== 'Not Enrolled'}
															{@const isSelected = multiSelect.selectedIds.has(student._id)}
															<div
																class={[
																	!enrolled &&
																		'text-muted-foreground bg-black/10 max-md:bg-gray-100',
																	enrolled && 'max-md:bg-white',
																	'flex items-center gap-1 truncate px-1 py-1 text-xs leading-tight hover:bg-black/5',
																	'max-md:gap-3 max-md:rounded max-md:border max-md:px-3 max-md:py-3 max-md:text-sm max-md:shadow-sm hover:max-md:bg-gray-50',
																	isSelected && 'ring-2 ring-blue-500 ring-inset',
																	selectedSelectGrade !== null && 'cursor-pointer'
																]}
															>
																<div
																	use:draggable={{
																		data: {
																			id: student._id,
																			name: student.name,
																			sourceClassId: cls._id,
																			sourceGrade: cls.grade
																		},
																		label:
																			selectedSelectGrade !== null &&
																			multiSelect.selectedIds.has(student._id) &&
																			multiSelect.selectedIds.size > 1
																				? `${multiSelect.selectedIds.size} students`
																				: student.name,
																		onReject: () => {
																			crossGradeErrorMessage =
																				'Moving students between different grades is not allowed here';
																			crossGradeDialogRef?.showModal();
																		}
																	}}
																	class={[
																		'flex flex-1 items-center gap-1 truncate',
																		selectedSelectGrade !== null ? 'cursor-pointer' : 'cursor-grab'
																	]}
																	role="button"
																	aria-pressed={selectedSelectGrade !== null
																		? isSelected
																		: undefined}
																	aria-label={selectedSelectGrade !== null
																		? `Select ${student.name}`
																		: `Move ${student.name} to another class`}
																	tabindex="0"
																	onclick={() => {
																		if (
																			selectedSelectGrade !== null &&
																			selectedSelectGrade === cls.grade
																		) {
																			multiSelect.toggleSelect(student._id);
																		} else {
																			openMoveDialog(student, cls);
																		}
																	}}
																	onkeydown={(e) => {
																		if (e.key === 'Enter') {
																			if (
																				selectedSelectGrade !== null &&
																				selectedSelectGrade === cls.grade
																			) {
																				multiSelect.toggleSelect(student._id);
																			} else {
																				openMoveDialog(student, cls);
																			}
																		}
																	}}
																>
																	{#if selectedSelectGrade === cls.grade}
																		<input
																			type="checkbox"
																			checked={isSelected}
																			class="size-3 shrink-0 max-md:size-4"
																			onclick={(e) => e.stopPropagation()}
																			onchange={() => multiSelect.toggleSelect(student._id)}
																		/>
																	{/if}
																	<GripVertical
																		class={[
																			'size-2.5 shrink-0 opacity-40 max-md:hidden',
																			selectedSelectGrade === cls.grade && 'hidden'
																		]}
																	/>
																	<span class="truncate max-md:text-base">{student.name}</span>
																</div>
															</div>
														{/each}
													</div>
												{:else}
													<p
														class="text-muted-foreground px-1 py-0 text-xs italic max-md:px-2 max-md:py-1 max-md:text-sm"
													>
														--
													</p>
												{/if}
											</div>
										{/if}
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		</div>

		<BulkActionBar
			selectedCount={multiSelect.selectedCount}
			actions={bulkClassActions}
			onDone={exitGradeSelection}
		/>
	{/if}
</div>

<!-- Add Dialog -->
<dialog
	bind:this={addDialogRef}
	class="fixed inset-0 m-auto w-full max-w-sm rounded-none border p-4 shadow-lg"
	onclose={closeAddDialog}
	onclick={(e) => {
		if (e.currentTarget === e.target) {
			closeAddDialog();
		}
	}}
>
	<h3 class="mb-4 text-lg font-semibold">Add Class - Grade {addGrade}</h3>

	{#if addError}
		<div class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
			{addError}
		</div>
	{/if}

	<p class="text-muted-foreground mb-4 text-sm">
		A new class will be created with the next available number (auto-increment).
	</p>

	<form method="dialog" class="flex justify-end gap-2">
		<Button type="button" variant="outline" onclick={closeAddDialog}>Cancel</Button>
		<Button
			type="submit"
			disabled={isAdding}
			onclick={(e) => {
				e.preventDefault();
				handleAdd();
			}}
		>
			{isAdding ? 'Adding...' : 'Add Class'}
		</Button>
	</form>
</dialog>

<!-- Delete Confirmation / Warning Dialog -->
<dialog
	bind:this={warningDialogRef}
	class="fixed inset-0 m-auto w-full max-w-sm rounded-none border p-4 shadow-lg"
	onclick={(e) => {
		if (e.currentTarget === e.target) {
			warningDialogRef?.close();
		}
	}}
>
	{#if warningClass && warningClass.studentCount > 0}
		<!-- Warning: students assigned -->
		<h3 class="mb-2 text-lg font-semibold text-red-600">Cannot Delete Class</h3>
		<p class="text-muted-foreground mb-4 text-sm">
			Class {getDisplayName(warningClass.grade, warningClass.class)} has {warningClass.studentCount}
			student{warningClass.studentCount !== 1 ? 's' : ''} assigned.
		</p>
		<p class="mb-4 text-sm">
			To delete this class, please first remove or reassign these students to another class.
		</p>
		<div class="flex justify-end">
			<Button onclick={() => warningDialogRef?.close()}>OK</Button>
		</div>
	{:else}
		<!-- Confirmation: no students -->
		<h3 class="mb-2 text-lg font-semibold">Delete Class</h3>
		<p class="text-muted-foreground mb-4 text-sm">
			Are you sure you want to delete class {warningClass
				? getDisplayName(warningClass.grade, warningClass.class)
				: ''}? This cannot be undone.
		</p>
		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => warningDialogRef?.close()}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDelete}>Delete</Button>
		</div>
	{/if}
</dialog>

<!-- Cross-Grade Drag Warning Dialog -->
<dialog
	bind:this={crossGradeDialogRef}
	class="fixed inset-0 m-auto w-full max-w-sm rounded-none border p-4 shadow-lg"
	onclick={(e) => {
		if (e.currentTarget === e.target) {
			crossGradeDialogRef?.close();
		}
	}}
>
	<h3 class="mb-2 text-lg font-semibold text-red-600">Cannot Move Student</h3>
	<p class="text-muted-foreground mb-4 text-sm">
		{crossGradeErrorMessage}
	</p>
	<div class="flex justify-end">
		<Button onclick={() => crossGradeDialogRef?.close()}>OK</Button>
	</div>
</dialog>

<MoveDialog
	open={!!moveDialogStudent}
	onClose={closeMoveDialog}
	title={moveDialogStudent ? `Move ${moveDialogStudent.name}` : ''}
	subtitle={moveDialogStudent
		? `Currently in ${classesByGrade[moveDialogStudent.grade!]?.find((c) => c._id === moveDialogStudent!.classId) ? getDisplayName(classesByGrade[moveDialogStudent.grade!].find((c) => c._id === moveDialogStudent!.classId)!.grade, classesByGrade[moveDialogStudent.grade!].find((c) => c._id === moveDialogStudent!.classId)!.class) : ''}`
		: ''}
	targets={moveDialogStudent
		? classesByGrade[moveDialogStudent.grade!]
				?.filter(
					(c) =>
						c._id !== moveDialogStudent!.classId &&
						(c.class !== 'IB' || moveDialogStudent!.grade! >= 11)
				)
				.map((c) => ({
					label: getDisplayName(c.grade, c.class),
					action: () => {
						moveStudent(moveDialogStudent!.id, c._id);
						closeMoveDialog();
					},
					color: gradeColorClasses[c.grade]
				})) || []
		: []}
/>
