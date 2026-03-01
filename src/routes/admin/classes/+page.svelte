<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Plus, Trash2, Eye, EyeOff, Users, GripVertical } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { onMount } from 'svelte';

	// Client-side helper functions (duplicated from classes.ts for client use)
	function getDisplayName(grade: number, className: string, gradeClasses?: ClassRecord[]): string {
		if (className === 'default') return `${grade}`;
		if (className === 'IB') return `${grade}-IB`;
		// Check if grade has only "1" and "IB" classes - if so, display "1" as just the grade number
		if (gradeClasses && className === '1') {
			const classNames = gradeClasses.map((c) => c.class);
			if (classNames.length === 2 && classNames.includes('1') && classNames.includes('IB')) {
				return `${grade}`;
			}
		}
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
		const lightness = Math.min(98, 82 + position * 6);

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

	// State for visible grades (default all grades visible)
	let visibleGrades = $state<Set<number>>(new Set([7, 8, 9, 10, 11, 12]));

	// State for global student list visibility toggle
	let globalStudentListsVisible = $state(false);

	// State for IB visibility per grade (grades where IB classes should be shown)
	let ibVisibleGrades = $state<Set<number>>(new Set());

	// Add dialog state
	let addDialogRef = $state<HTMLDialogElement | null>(null);
	let addGrade = $state<number | null>(null);
	let addError = $state('');
	let isAdding = $state(false);

	// Warning dialog state
	let warningDialogRef = $state<HTMLDialogElement | null>(null);
	let warningClass = $state<ClassRecord | null>(null);

	// Grade error dialog state
	let gradeErrorDialogRef = $state<HTMLDialogElement | null>(null);
	let gradeErrorMessage = $state('');

	// Drag and drop state
	let draggedStudent = $state<{
		id: string;
		name: string;
		sourceClassId: string;
		grade: number;
	} | null>(null);
	let dragOverClassId = $state<string | null>(null);

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
		visibleGrades = new Set(visibleGrades);
	}

	// Toggle global student list visibility
	function toggleGlobalStudentLists() {
		globalStudentListsVisible = !globalStudentListsVisible;
	}

	// Toggle IB visibility for a grade
	function toggleIBVisibility(grade: number) {
		if (ibVisibleGrades.has(grade)) {
			ibVisibleGrades.delete(grade);
		} else {
			ibVisibleGrades.add(grade);
		}
		ibVisibleGrades = new Set(ibVisibleGrades);
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
		} catch (e) {
			// Handle error
		}
	}

	async function deleteClass(cls: ClassRecord) {
		if (isProtectedClass(cls.class)) {
			window.alert(
				`Cannot delete protected class ${getDisplayName(cls.grade, cls.class, classesByGrade[cls.grade])}: ${cls.class === 'default' ? 'default' : 'IB'} classes are required`
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

	// Drag and drop handlers
	function handleDragStart(
		e: DragEvent,
		student: { _id: string; name: string },
		sourceClassId: string,
		grade: number
	) {
		draggedStudent = { id: student._id, name: student.name, sourceClassId, grade };
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', student._id);
		}
	}

	function handleDragEnd() {
		draggedStudent = null;
		dragOverClassId = null;
	}

	function handleDragOver(e: DragEvent, targetClassId: string, targetGrade: number) {
		e.preventDefault();
		if (!draggedStudent) return;

		// Only allow dropping on classes in the same grade
		if (draggedStudent.grade === targetGrade && draggedStudent.sourceClassId !== targetClassId) {
			dragOverClassId = targetClassId;
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
		}
	}

	function handleDragLeave() {
		dragOverClassId = null;
	}

	async function handleDrop(e: DragEvent, targetClassId: string, targetGrade: number) {
		e.preventDefault();
		dragOverClassId = null;

		if (!draggedStudent) return;

		// Verify same grade
		if (draggedStudent.grade !== targetGrade) {
			gradeErrorMessage = `Cannot move student from Grade ${draggedStudent.grade} to Grade ${targetGrade}. Students can only be moved between classes in the same grade.`;
			gradeErrorDialogRef?.showModal();
			return;
		}

		// Don't drop on same class
		if (draggedStudent.sourceClassId === targetClassId) {
			return;
		}

		try {
			await client.mutation(api.classes.moveStudent, {
				studentId: draggedStudent.id as Id<'students'>,
				targetClassId: targetClassId as Id<'classes'>
			});
			// Convex reactivity will automatically update the UI
		} catch (e) {
			window.alert(e instanceof Error ? e.message : 'Failed to move student');
		}

		draggedStudent = null;
	}
</script>

<div class="space-y-2">
	<!-- Top Control Bar -->
	<div class="flex flex-wrap items-center gap-3 bg-muted/50 px-3 py-2 border rounded-sm">
		<!-- Grade Checkboxes -->
		<div class="flex items-center gap-2">
			<span class="mr-1 text-muted-foreground text-xs">Grades:</span>
			{#each grades as grade}
				<label class="flex items-center gap-1 cursor-pointer">
					<input
						type="checkbox"
						checked={visibleGrades.has(grade)}
						onchange={() => toggleGradeVisibility(grade)}
						class="size-3"
					/>
					<span class="text-xs">{grade}</span>
				</label>
			{/each}
		</div>

		<div class="mx-1 bg-border w-px h-4"></div>

		<!-- Global Student Lists Toggle -->
		<Button
			variant="ghost"
			size="sm"
			class="gap-1 px-2 h-6 text-xs"
			onclick={toggleGlobalStudentLists}
			aria-label={globalStudentListsVisible ? 'Hide all student lists' : 'Show all student lists'}
		>
			{#if globalStudentListsVisible}
				<EyeOff class="size-3" />
				<span>Hide Students</span>
			{:else}
				<Eye class="size-3" />
				<span>Show Students</span>
			{/if}
		</Button>
	</div>

	{#if classesQuery.isLoading}
		<div class="py-4 text-muted-foreground text-sm text-center">Loading classes...</div>
	{:else if classesQuery.error}
		<div class="py-4 text-red-500 text-sm text-center">Error loading classes</div>
	{:else}
		<div class="flex flex-wrap gap-0">
			{#each grades as grade (grade)}
				{@const gradeClasses = classesByGrade[grade] || []}
				{@const totalStudents = gradeClasses.reduce((sum, c) => sum + c.studentCount, 0)}
				{@const isGradeVisible = visibleGrades.has(grade)}
				{@const ibHasStudents = hasIBStudents(grade)}
				{@const shouldShowIB = ibHasStudents || ibVisibleGrades.has(grade)}
				{#if isGradeVisible}
					<div class="border-0 border-gray-200">
						<!-- Grade Header -->
						<div
							class="flex justify-between items-center bg-muted/30 px-1 py-0.5 border-r border-r-gray-300 last-border-r-none border-b"
						>
							<div class="flex items-center gap-1">
								<span class="font-semibold text-sm">G{grade}</span>
								<Users class="ml-2 size-3" /><span class="text-muted-foreground text-xs"
									>{totalStudents}</span
								>
							</div>
							<div class="flex items-center gap-0">
								<!-- IB Toggle Button (only show if IB has no students) -->
								{#if !ibHasStudents}
									<Button
										variant="ghost"
										size="icon"
										class="rounded-none size-5 shrink-0"
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
									variant="ghost"
									size="icon"
									class="rounded-none size-5 shrink-0"
									onclick={() => openAddDialog(grade)}
									aria-label="Add class to grade {grade}"
								>
									<Plus class="size-3" />
								</Button>
							</div>
						</div>

						<!-- Classes List -->
						<div class="flex flex-row flex-wrap gap-0">
							{#each gradeClasses as cls, classIndex (cls._id)}
								{@const isIBClass = cls.class === 'IB'}
								{@const shouldRenderClass = !isIBClass || shouldShowIB}
								{@const isDragOver = dragOverClassId === cls._id}
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
									<div
										class="flex min-w-25 flex-1 flex-col gap-0 border-r border-b p-0 transition-all {isDragOver
											? 'scale-[1.02] ring-2 ring-blue-500 ring-inset'
											: ''}"
										style="background-color: {cardBg};"
										role="region"
										aria-label="Class {getDisplayName(cls.grade, cls.class, gradeClasses)}"
										ondragover={(e) => handleDragOver(e, cls._id, cls.grade)}
										ondragleave={handleDragLeave}
										ondrop={(e) => handleDrop(e, cls._id, cls.grade)}
									>
										<!-- Class Header -->
										<div class="flex justify-between items-center px-1 py-0.5">
											<div class="flex items-center gap-1">
												<!-- IB Logo for IB classes -->
												{#if isIBClass}
													<img
														src="/International_Baccalaureate_Logo.svg"
														alt="IB"
														class="size-3 shrink-0"
													/>
												{/if}

												<!-- Class Name -->
												<span class="font-semibold text-sm">
													{getDisplayName(cls.grade, cls.class, gradeClasses)}
												</span>

												<!-- Student Count (inline with class name) -->
												<Users class="ml-2 size-3" /><span class="text-muted-foreground text-xs"
													>{cls.studentCount}</span
												>
											</div>

											<!-- Delete Button (only for non-protected classes) -->
											{#if !isProtectedClass(cls.class)}
												<Button
													variant="ghost"
													size="icon"
													class="p-0 rounded-none size-4 text-red-500 hover:text-red-600 shrink-0"
													onclick={() => deleteClass(cls)}
												>
													<Trash2 class="size-2.5" />
												</Button>
											{/if}
										</div>

										<!-- Teacher Dropdown (no label) -->
										<div class="px-1 pb-0.5">
											<NativeSelect.Root
												value={cls.homeroomTeacherId?.toString() || ''}
												onchange={(e: Event) => {
													const target = e.target as HTMLSelectElement;
													updateTeacher(cls, target.value || undefined);
												}}
												class="px-0 py-0 rounded-none w-full h-5 min-h-0 text-xs"
												aria-label="Teacher for {getDisplayName(
													cls.grade,
													cls.class,
													gradeClasses
												)}"
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

										<!-- Student List (shown when global toggle is on) -->
										{#if globalStudentListsVisible}
											<div class="border-t text-center" style="background-color:{studentListBg}">
												{#if cls.students && cls.students.length > 0}
													<div class="flex flex-col gap-0 max-h-20 overflow-y-auto">
														{#each cls.students as student (student._id)}
															{@const enrolled = student.status !== 'Not Enrolled'}
															<div
																class={[
																	!enrolled && 'text-muted-foreground bg-black/10',
																	'flex cursor-grab items-center gap-1 truncate px-1 py-1 text-xs leading-tight hover:bg-black/5 active:cursor-grabbing'
																]}
																draggable="true"
																ondragstart={(e) => handleDragStart(e, student, cls._id, cls.grade)}
																ondragend={handleDragEnd}
																role="button"
																aria-label="Drag {student.name} to move to another class"
																tabindex="0"
															>
																<GripVertical class="opacity-40 size-2.5 shrink-0" />
																<span class="truncate">{student.name}</span>
															</div>
														{/each}
													</div>
												{:else}
													<p class="px-1 py-0 text-muted-foreground text-xs italic">--</p>
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
	{/if}
</div>

<!-- Add Dialog -->
<dialog
	bind:this={addDialogRef}
	class="fixed inset-0 shadow-lg m-auto p-4 border rounded-none w-full max-w-sm"
	onclose={closeAddDialog}
	onclick={(e) => {
		if (e.currentTarget === e.target) {
			closeAddDialog();
		}
	}}
>
	<h3 class="mb-4 font-semibold text-lg">Add Class - Grade {addGrade}</h3>

	{#if addError}
		<div class="bg-red-50 mb-4 p-3 border border-red-200 rounded-md text-red-600 text-sm">
			{addError}
		</div>
	{/if}

	<p class="mb-4 text-muted-foreground text-sm">
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
	class="fixed inset-0 shadow-lg m-auto p-4 border rounded-none w-full max-w-sm"
	onclick={(e) => {
		if (e.currentTarget === e.target) {
			warningDialogRef?.close();
		}
	}}
>
	{#if warningClass && warningClass.studentCount > 0}
		<!-- Warning: students assigned -->
		<h3 class="mb-2 font-semibold text-red-600 text-lg">Cannot Delete Class</h3>
		<p class="mb-4 text-muted-foreground text-sm">
			Class {getDisplayName(
				warningClass.grade,
				warningClass.class,
				classesByGrade[warningClass.grade]
			)} has {warningClass.studentCount}
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
		<h3 class="mb-2 font-semibold text-lg">Delete Class</h3>
		<p class="mb-4 text-muted-foreground text-sm">
			Are you sure you want to delete class {warningClass
				? getDisplayName(warningClass.grade, warningClass.class, classesByGrade[warningClass.grade])
				: ''}? This cannot be undone.
		</p>
		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => warningDialogRef?.close()}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDelete}>Delete</Button>
		</div>
	{/if}
</dialog>

<!-- Grade Error Dialog -->
<dialog
	bind:this={gradeErrorDialogRef}
	class="fixed inset-0 shadow-lg m-auto p-4 border rounded-none w-full max-w-sm"
	onclick={(e) => {
		if (e.currentTarget === e.target) {
			gradeErrorDialogRef?.close();
		}
	}}
>
	<h3 class="mb-2 font-semibold text-red-600 text-lg">Cannot Move Student</h3>
	<p class="mb-4 text-muted-foreground text-sm">
		{gradeErrorMessage}
	</p>
	<div class="flex justify-end">
		<Button onclick={() => gradeErrorDialogRef?.close()}>OK</Button>
	</div>
</dialog>
