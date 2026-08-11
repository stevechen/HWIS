<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import {
		Plus,
		Trash2,
		Pencil,
		Search,
		Upload,
		Check,
		X,
		CircleQuestionMark,
		Loader
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import Label from '$lib/components/ui/label/label.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { parseCsv, mapCsvRowToStudent } from './import-utils';
	import { HOUSES, HOUSE_COLORS, type House } from '$lib/constants/houses';
	import { cn } from '$lib/utils.js';

	type Student = {
		_id: Id<'students'>;
		_creationTime: number;
		e2eTag?: string;
		englishName: string;
		chineseName: string;
		studentId: string;
		classId: Id<'classes'>;
		classInfo: {
			_id: Id<'classes'>;
			_creationTime: number;
			grade: number;
			class: string;
			homeroomTeacherId?: Id<'users'>;
			homeroomTeacherName: string | null;
		} | null;
		status: 'Enrolled' | 'Not Enrolled';
		house?: House;
		note?: string;
	};

	const studentsApi = api.students;
	let searchQuery = $state('');
	let selectedGrade = $state<string>('');
	let selectedHouse = $state<string>('');
	let selectedStatus = $state<string>('');
	let selectedClass = $state<string>('');
	let numItems = $state(100);
	let accumulatedStudents = $state<Student[]>([]);
	let isStudentListDone = $state(false);
	let isLoadingMoreStudents = $state(false);
	let sortBy = $state<'studentId' | 'englishName' | 'chineseName' | 'grade' | 'house'>(
		'englishName'
	);
	let sortDirection = $state<'asc' | 'desc'>('asc');
	let sentinelElement = $state<HTMLElement | null>(null);
	let observer: IntersectionObserver | null = null;
	let previousQueryKey = '';
	const studentsQueryArgs = $derived({
		paginationOpts: { cursor: null, numItems },
		search: searchQuery || undefined,
		status: selectedStatus ? (selectedStatus as 'Enrolled' | 'Not Enrolled') : undefined,
		grade: selectedGrade ? Number(selectedGrade) : undefined,
		class: selectedClass || undefined,
		house: selectedHouse ? (selectedHouse as House | '__unassigned') : undefined,
		sortBy,
		sortDirection
	});
	const studentsQuery = useQuery(studentsApi.listPaginated, () => studentsQueryArgs, {
		keepPreviousData: true
	});
	const classesApi = api.classes;
	const classesQuery = useQuery(classesApi.list, () => ({}));
	const client = useConvexClient();

	$effect(() => {
		const queryKey = JSON.stringify({
			searchQuery,
			selectedGrade,
			selectedHouse,
			selectedStatus,
			selectedClass,
			sortBy,
			sortDirection
		});
		if (previousQueryKey && previousQueryKey !== queryKey) {
			numItems = 100;
			accumulatedStudents = [];
			isStudentListDone = false;
			isLoadingMoreStudents = false;
		}
		previousQueryKey = queryKey;
	});

	$effect(() => {
		if (!studentsQuery.data) return;

		if (!Array.isArray(studentsQuery.data.page)) return;
		accumulatedStudents = studentsQuery.data.page as Student[];
		isStudentListDone = studentsQuery.data.isDone;
		isLoadingMoreStudents = false;
	});

	function loadMoreStudents() {
		if (isStudentListDone || isLoadingMoreStudents || studentsQuery.isLoading) return;
		if (!studentsQuery.data?.continueCursor) return;

		isLoadingMoreStudents = true;
		numItems += 100;
	}

	function toggleSort(field: typeof sortBy) {
		if (sortBy === field) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = field;
			sortDirection = 'asc';
		}
	}

	function sortIndicator(field: typeof sortBy) {
		if (sortBy !== field) return '';
		return sortDirection === 'asc' ? ' ↑' : ' ↓';
	}

	function sortValue(field: typeof sortBy) {
		return sortBy === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
	}

	// Automatically seed default classes when page loads
	onMount(async () => {
		try {
			await client.mutation(api.classes.seedDefaultClasses, {});
		} catch {
			// Ignore errors - classes may already exist
		}
	});

	$effect(() => {
		if (!Array.isArray(studentsQuery.data?.page) || studentsQuery.data.isDone) return;
		if (!observer) {
			observer = new IntersectionObserver(
				(entries) => {
					if (entries[0]?.isIntersecting && !isStudentListDone) loadMoreStudents();
				},
				{ rootMargin: '200px' }
			);
		}
		if (sentinelElement) observer.observe(sentinelElement);
		return () => observer?.disconnect();
	});

	onDestroy(() => observer?.disconnect());

	// Dialog visibility
	let showForm = $state(false);
	let showDelete = $state(false);
	let showImport = $state(false);
	let showDisable = $state(false);

	// Form state
	let editingId = $state<Id<'students'> | null>(null);
	let originalStatus = $state<'Enrolled' | 'Not Enrolled' | null>(null);
	let formStudentId = $state('');
	let formEnglishName = $state('');
	let formChineseName = $state('');
	let formGrade = $state(7);
	let formClass = $state<string>('');
	let formGradeClass = $state<string>(''); // Combined grade-class selection
	let formStatus = $state<'Enrolled' | 'Not Enrolled'>('Enrolled');
	let formHouse = $state<House | ''>('');
	let formNote = $state('');
	let isSubmitting = $state(false);
	let formErrors = $state<string[]>([]);

	// Delete dialog state
	let studentToDelete = $state<Student | null>(null);
	let deleteHasRelated = $state(false);
	let relatedCount = $state(0);

	// Disable student state
	let studentToDisable = $state<Student | null>(null);

	// Import dialog state
	let importMode = $state<'halt' | 'skip' | 'update'>('halt');
	let importFile = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let importPreview = $state<Record<string, string>[]>([]);
	let importResult = $state<{
		created: string[];
		updated: string[];
		skipped: string[];
		errors: { studentId: string; reason: string }[];
	} | null>(null);
	let isImporting = $state(false);
	let importError = $state('');

	// Duplicate check state
	let isCheckingId = $state(false);
	let idAvailability = $state<'available' | 'taken' | 'unknown'>('unknown');

	const grades = GRADES;
	const statuses = ['Enrolled', 'Not Enrolled'] as const;

	import { GRADES, getDisplayName } from '$convex/shared/class_roster';

	// Combined grade-class options for the form dropdown
	let gradeClassOptions = $derived.by(() => {
		if (!classesQuery.data || classesQuery.data.length === 0) {
			// No classes available - return empty array
			return [];
		}
		return classesQuery.data
			.filter((c) => c.class !== 'IB' || c.grade >= 11)
			.map((c) => ({
				value: `${c.grade}-${c.class}`,
				label: getDisplayName(c.grade, c.class),
				grade: c.grade,
				classNum: c.class,
				classId: c._id
			}));
	});

	function startAdd() {
		formStudentId = '';
		formEnglishName = '';
		formChineseName = '';
		formGrade = 7;
		formClass = '';
		formGradeClass = '7-default'; // Default to grade 7 default class
		formStatus = 'Enrolled';
		formHouse = '';
		formNote = '';
		editingId = null;
		formErrors = [];
		idAvailability = 'unknown';
	}

	function startEdit(student: Student) {
		formStudentId = student.studentId;
		formEnglishName = student.englishName;
		formChineseName = student.chineseName || '';
		// Set combined grade-class value from classInfo
		if (student.classInfo) {
			formGradeClass = `${student.classInfo.grade}-${student.classInfo.class}`;
		} else if (student.classId && classesQuery.data) {
			// Fallback: look up class from classes list
			const cls = classesQuery.data.find((c) => c._id === student.classId);
			if (cls) {
				formGradeClass = `${cls.grade}-${cls.class}`;
			} else {
				formGradeClass = '';
			}
		} else {
			formGradeClass = '';
		}
		// Parse formGradeClass to set formGrade and formClass
		const parts = formGradeClass.split('-');
		if (parts.length === 2) {
			formGrade = parseInt(parts[0]);
			formClass = parts[1];
		}
		formStatus = student.status || 'Enrolled';
		formHouse = student.house ?? '';
		formNote = student.note || '';
		originalStatus = student.status;
		editingId = student._id;
		formErrors = [];
		idAvailability = 'unknown';
	}

	// Handle combined grade-class selection change
	function handleGradeClassChange(value: string) {
		formGradeClass = value;
		const parts = value.split('-');
		if (parts.length === 2) {
			formGrade = parseInt(parts[0]);
			formClass = parts[1];
		}
	}

	async function checkIdAvailability() {
		if (!formStudentId.trim()) return;
		isCheckingId = true;
		try {
			const result = await client.query(studentsApi.checkStudentIdExists, {
				studentId: formStudentId.trim(),
				excludeId: editingId || undefined
			});
			idAvailability = result.exists ? 'taken' : 'available';
		} catch {
			idAvailability = 'unknown';
		} finally {
			isCheckingId = false;
		}
	}

	async function handleSubmit() {
		formErrors = [];

		// Collect validation errors
		if (!formStudentId.trim()) {
			formErrors.push('Student ID required');
		}
		if (!formEnglishName.trim()) {
			formErrors.push('English name required');
		}

		// Check for duplicate ID before validation
		if (formStudentId.trim()) {
			try {
				const result = await client.query(studentsApi.checkStudentIdExists, {
					studentId: formStudentId.trim(),
					excludeId: editingId || undefined
				});
				if (result.exists) {
					formErrors.push('Student ID taken');
				}
			} catch {
				// Ignore check errors, let the mutation handle it
			}
		}

		if (formErrors.length > 0) return;

		isSubmitting = true;
		try {
			if (editingId) {
				await client.mutation(studentsApi.update, {
					id: editingId,
					englishName: formEnglishName.trim(),
					chineseName: formChineseName.trim(),
					studentId: formStudentId.trim(),
					grade: formGrade,
					class: formClass || 'default',
					status: formStatus,
					house: formHouse || undefined,
					note: formNote.trim()
				});
			} else {
				await client.mutation(studentsApi.create, {
					englishName: formEnglishName.trim(),
					chineseName: formChineseName.trim(),
					studentId: formStudentId.trim(),
					grade: formGrade,
					class: formClass || 'default',
					status: formStatus,
					house: formHouse || undefined,
					note: formNote.trim()
				});
			}
			showForm = false;
		} catch (e) {
			const errorMsg = e instanceof Error ? e.message : String(e);
			if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
				formErrors.push('Student ID taken');
			} else {
				formErrors.push(errorMsg);
			}
		} finally {
			isSubmitting = false;
		}
	}

	async function confirmDelete(student: Student) {
		studentToDelete = student;

		const related = await client.query(studentsApi.checkStudentHasEvaluations, {
			id: student._id
		});
		deleteHasRelated = related.hasEvaluations;
		relatedCount = related.count;
	}

	async function handleSetNotEnrolled() {
		if (!studentToDelete) return;
		await client.mutation(studentsApi.disableStudent, {
			id: studentToDelete._id
		});
		studentToDelete = null;
		showDelete = false;
	}

	async function handleDelete() {
		if (!studentToDelete) return;

		try {
			if (deleteHasRelated) {
				await client.mutation(studentsApi.removeWithCascade, {
					id: studentToDelete._id
				});
			} else {
				await client.mutation(studentsApi.remove, {
					id: studentToDelete._id
				});
			}
			studentToDelete = null;
			showDelete = false;
		} catch (e) {
			alert('Failed to delete: ' + (e instanceof Error ? e.message : String(e)));
		}
	}

	async function handleDisable() {
		if (!studentToDisable) return;
		await client.mutation(studentsApi.disableStudent, {
			id: studentToDisable._id
		});
		studentToDisable = null;
		showDisable = false;
	}

	async function handleImportPreview() {
		if (!importFile) return;

		try {
			const text = await importFile.text();
			const rows = parseCsv(text);
			importPreview = rows.slice(0, 10);
			importError = '';
		} catch (e) {
			importPreview = [];
			importError = e instanceof Error ? e.message : 'Failed to parse CSV file';
		}
	}

	async function handleImport() {
		if (!importFile) return;

		isImporting = true;
		importResult = null;
		importError = '';

		try {
			const text = await importFile.text();
			const rows = parseCsv(text);
			if (rows.length === 0) {
				throw new Error('CSV file has no data rows');
			}
			const students = rows.map((row) => mapCsvRowToStudent(row));

			const result = await client.mutation(studentsApi.bulkImportWithDuplicateCheck, {
				students,
				mode: importMode
			});

			importResult = result;
			if (result.errors.length === 0) {
				showImport = false;
				importFile = null;
				importPreview = [];
				importResult = null;
			}
		} catch (e) {
			importError = e instanceof Error ? e.message : 'Import failed';
		} finally {
			isImporting = false;
		}
	}

	const filteredStudents = $derived(
		accumulatedStudents.filter((s: Student) => {
			if (selectedStatus && s.status !== selectedStatus) return false;
			if (selectedHouse) {
				if (selectedHouse === '__unassigned') {
					if (s.house) return false;
				} else if (s.house !== selectedHouse) {
					return false;
				}
			}
			if (selectedGrade && s.classInfo?.grade !== parseInt(selectedGrade)) return false;
			if (selectedClass && s.classInfo?.class !== selectedClass) return false;
			if (searchQuery) {
				const search = searchQuery.toLowerCase();
				return (
					s.englishName.toLowerCase().includes(search) ||
					s.chineseName.includes(search) ||
					s.studentId.toLowerCase().includes(search)
				);
			}
			return true;
		}) ?? []
	);
</script>

<div class="bg-background flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden">
	<header class="bg-card shrink-0 border-b shadow-sm">
		<div class="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-end">
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						testId="admin-students.import-button"
						onclick={() => {
							showImport = true;
						}}
						aria-label="Import students from file"
					>
						<Upload class="mr-2 size-4" />
						Import
					</Button>
					<Button
						variant="outline"
						onclick={() => {
							startAdd();
							showForm = true;
						}}
						aria-label="Add new student"
						data-testid="admin-students.add-button"
					>
						<Plus class="mr-2 size-4" />
						Add Student
					</Button>
				</div>
			</div>
		</div>
	</header>

	<main class="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
		<div
			data-testid="admin-students"
			class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div class="relative max-w-md flex-1">
				<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
				<Input
					placeholder="Search by name or student ID..."
					class="pl-9"
					bind:value={searchQuery}
					aria-label="Search students"
					data-testid="admin-students.search-input"
				/>
			</div>
			<div class="flex gap-2">
				<NativeSelect.Root
					bind:value={selectedGrade}
					aria-label="Filter by grade"
					data-testid="admin-students.filter-grade"
				>
					<NativeSelect.Option value="">All Grades</NativeSelect.Option>
					{#each grades as grade (grade)}
						<NativeSelect.Option value={grade.toString()}>Grade {grade}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
				<NativeSelect.Root
					bind:value={selectedHouse}
					aria-label="Filter by house"
					data-testid="admin-students.filter-house"
				>
					<NativeSelect.Option value="">All Houses</NativeSelect.Option>
					{#each HOUSES as house (house)}
						<NativeSelect.Option value={house}>{house}</NativeSelect.Option>
					{/each}
					<NativeSelect.Option value="__unassigned">Unassigned</NativeSelect.Option>
				</NativeSelect.Root>
				<NativeSelect.Root
					bind:value={selectedStatus}
					aria-label="Filter by status"
					data-testid="admin-students.filter-status"
				>
					<NativeSelect.Option value="">All Status</NativeSelect.Option>
					{#each statuses as status (status)}
						<NativeSelect.Option value={status}>{status}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
		</div>

		{#if studentsQuery.isLoading}
			<div class="text-muted-foreground flex flex-1 items-center justify-center text-center">
				Loading students...
			</div>
		{:else if studentsQuery.error}
			<div class="flex flex-1 items-center justify-center py-8 text-center text-red-500">
				Error loading students: {import.meta.env.DEV
					? studentsQuery.error.message
					: 'An error occurred'}
			</div>
		{:else if filteredStudents.length === 0}
			<div class="text-muted-foreground flex flex-1 items-center justify-center text-center">
				{searchQuery || selectedGrade || selectedStatus
					? 'No students match your filters'
					: 'No students yet. Add one or import from Excel!'}
			</div>
		{:else}
			<div class="students-scroll min-h-0 flex-1 overflow-auto rounded-lg border">
				<Table.Root aria-label="Student table">
					<Table.Header class="bg-background/80 sticky top-0 z-10 backdrop-blur">
						<Table.Row>
							<Table.Head class="w-7" />
							<Table.Head
								class="hidden text-center sm:table-cell"
								aria-sort={sortValue('studentId')}
							>
								<button type="button" onclick={() => toggleSort('studentId')}>
									Student ID{sortIndicator('studentId')}
								</button>
							</Table.Head>
							<Table.Head
								class="whitespace-normal sm:whitespace-nowrap"
								aria-sort={sortValue('englishName')}
							>
								<button type="button" onclick={() => toggleSort('englishName')}>
									English Name{sortIndicator('englishName')}
								</button>
							</Table.Head>
							<Table.Head class="hidden sm:table-cell" aria-sort={sortValue('chineseName')}>
								<button type="button" onclick={() => toggleSort('chineseName')}>
									Chinese Name{sortIndicator('chineseName')}
								</button>
							</Table.Head>
							<Table.Head class="px-1 text-center sm:px-2" aria-sort={sortValue('grade')}>
								<button type="button" onclick={() => toggleSort('grade')}>
									Grade{sortIndicator('grade')}
								</button>
							</Table.Head>
							<Table.Head class="px-1 text-center sm:px-2" aria-sort={sortValue('house')}>
								<button type="button" onclick={() => toggleSort('house')}>
									House{sortIndicator('house')}
								</button>
							</Table.Head>
							<Table.Head class="hidden sm:table-cell">Note</Table.Head>
							<Table.Head class="px-1 text-center sm:px-2">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each filteredStudents as student (student._id)}
							<Table.Row
								data-testid={`admin-students.student-row-${student._id}`}
								data-student-id={student.studentId}
								data-student-name={student.englishName}
								class={student.status === 'Not Enrolled'
									? 'bg-muted-foreground opacity-50'
									: 'odd:bg-muted/40'}
							>
								<!-- Status (far left, always visible, light) -->
								<Table.Cell
									class="cursor-pointer px-0.5 text-center"
									data-testid={`admin-students.student-row-${student.studentId}.status`}
									aria-label={student.status}
									onclick={() =>
										client.mutation(studentsApi.changeStatus, {
											id: student._id,
											status: student.status === 'Enrolled' ? 'Not Enrolled' : 'Enrolled'
										})}
								>
									<span
										class={cn(
											'ms-auto block size-3 rounded-full',
											student.status === 'Enrolled'
												? 'bg-green-500 shadow shadow-green-500/70'
												: 'bg-gray-400 opacity-30'
										)}
									></span>
								</Table.Cell>
								<Table.Cell class="hidden text-center sm:table-cell sm:w-32 sm:ps-0.5"
									>{student.studentId}</Table.Cell
								>
								<Table.Cell class="max-w-20 truncate px-1 sm:max-w-none sm:px-2"
									>{student.englishName}</Table.Cell
								>
								<Table.Cell class="hidden sm:table-cell">{student.chineseName}</Table.Cell>
								<Table.Cell class="px-1 text-center sm:px-2">
									{student.classInfo
										? getDisplayName(student.classInfo.grade, student.classInfo.class)
										: '-'}
								</Table.Cell>
								<Table.Cell class="px-1 text-center sm:px-2">
									{#if student.house}
										<span class="inline-flex items-center justify-center gap-1">
											<span class={`size-2 rounded-full ${HOUSE_COLORS[student.house].bg}`}></span>
											<span class={`text-xs font-medium ${HOUSE_COLORS[student.house].text}`}
												>{student.house}</span
											>
										</span>
									{:else}
										<span class="text-muted-foreground text-xs">-</span>
									{/if}
								</Table.Cell>
								<Table.Cell
									class="text-muted-foreground hidden max-w-xs truncate text-sm sm:table-cell"
								>
									{student.note || '-'}
								</Table.Cell>
								<Table.Cell class="px-1 text-center sm:px-2">
									<div class="flex justify-center gap-0 sm:gap-1">
										<Button
											variant="ghost"
											size="icon"
											testId={`admin-students.student-row-${student.studentId}.edit`}
											onclick={() => {
												startEdit(student);
												showForm = true;
											}}
											aria-label="Edit {student.studentId}"
											class="hover:ring-primary/50 size-8 cursor-pointer hover:ring-2 hover:ring-offset-1 sm:size-10"
										>
											<Pencil class="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											testId={`admin-students.student-row-${student.studentId}.delete`}
											onclick={() => {
												confirmDelete(student);
												showDelete = true;
											}}
											aria-label="Delete {student.studentId}"
											class="hover:ring-destructive/50 size-8 cursor-pointer hover:ring-2 hover:ring-offset-1 sm:size-10"
										>
											<Trash2 class="size-4 text-red-500" />
										</Button>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
			{#if isLoadingMoreStudents}
				<div data-testid="admin-students.loading-more" class="flex justify-center py-4">
					<Loader class="text-muted-foreground size-6 animate-spin" />
				</div>
			{/if}
		{/if}
		<div data-testid="admin-students.sentinel" bind:this={sentinelElement} class="h-4"></div>
	</main>
</div>

<!-- Add/Edit Dialog -->
{#if showForm}
	<div
		data-testid="admin-students.dialog.root"
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-label="student form"
	>
		<div
			class="fixed inset-0 bg-black/50"
			onclick={() => (showForm = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showForm = false)}
		></div>
		<div class="bg-background relative w-full max-w-lg rounded-lg border p-6 shadow-lg">
			<div class="p-6">
				<h2 id="Student form-title" class="text-lg font-semibold">
					{editingId ? 'Edit Student' : 'Add New Student'}
				</h2>
				<div class="grid gap-4 py-4">
					{#if formErrors.length > 0}
						<div
							role="alert"
							class="rounded bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
							aria-label="Form errors"
						>
							<ul class="list-disc pl-4">
								{#each formErrors as error, idx (`${error}-${idx}`)}
									<li>{error}</li>
								{/each}
							</ul>
						</div>
					{/if}
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<Label for="studentId">Student ID *</Label>
							<div class="flex gap-2">
								<div class="relative flex-1">
									<Input
										id="studentId"
										bind:value={formStudentId}
										placeholder="e.g., 7001001 (6-7 digits)"
										onblur={checkIdAvailability}
										testId="admin-students.dialog.student-id"
										class={`
										${idAvailability === 'available' && 'text-green-600 dark:text-green-400'}
										${idAvailability === 'taken' && 'text-red-600 dark:text-red-400'}`}
										aria-label="Student ID"
									/>
								</div>
								<Button
									variant="outline"
									size="default"
									onclick={checkIdAvailability}
									disabled={!formStudentId.trim() || isCheckingId}
									title="Check ID"
									class={`
										${idAvailability === 'available' && 'text-green-600 dark:text-green-400'}
										${idAvailability === 'taken' && 'text-red-600 dark:text-red-400'}`}
									aria-label="ID {idAvailability}}"
								>
									{#if isCheckingId}
										<span
											class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
										></span>
									{:else if idAvailability === 'available'}
										<Check class="size-4" />
									{:else if idAvailability === 'taken'}
										<X class="size-4" />
									{:else}
										<CircleQuestionMark class="size-4" />
									{/if}
								</Button>
							</div>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="gradeClass">Grade *</Label>
						<NativeSelect.Root
							bind:value={formGradeClass}
							aria-label="Grade and Class"
							testId="admin-students.dialog.grade-class"
							onchange={(e) => {
								const target = e.target as HTMLSelectElement;
								handleGradeClassChange(target.value);
							}}
						>
							<NativeSelect.Option value="" disabled>Select grade and class</NativeSelect.Option>
							{#each gradeClassOptions as option (option.classId)}<NativeSelect.Option
									value={option.value}>{option.label}</NativeSelect.Option
								>{/each}
						</NativeSelect.Root>
					</div>
					<div class="space-y-2">
						<Label for="house">House</Label>
						<NativeSelect.Root
							bind:value={formHouse}
							aria-label="Student house"
							testId="admin-students.dialog.house"
						>
							<NativeSelect.Option value="">No House</NativeSelect.Option>
							{#each HOUSES as house (house)}
								<NativeSelect.Option value={house}>{house}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</div>
					<div class="space-y-2">
						<Label for="englishName">English Name *</Label>
						<Input
							id="englishName"
							bind:value={formEnglishName}
							placeholder="e.g., John Smith"
							testId="admin-students.dialog.english-name"
						/>
					</div>
					<div class="space-y-2">
						<Label for="chineseName">Chinese Name</Label>
						<Input
							id="chineseName"
							bind:value={formChineseName}
							placeholder="e.g., 張三"
							testId="admin-students.dialog.chinese-name"
						/>
					</div>
					<div class="space-y-2">
						<Label for="status">Status</Label>
						<NativeSelect.Root
							bind:value={formStatus}
							aria-label="Student status"
							testId="admin-students.dialog.status"
						>
							<NativeSelect.Option value="" disabled>Select status</NativeSelect.Option>
							{#each statuses as status (status)}
								<NativeSelect.Option value={status}>{status}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
						{#if editingId && originalStatus === 'Enrolled' && formStatus === 'Not Enrolled'}
							<p class="text-sm text-orange-600 dark:text-orange-400">
								Teachers will no longer be able to create evaluations for this student.
							</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="note">Note</Label>
						<Input
							id="note"
							bind:value={formNote}
							placeholder="Optional notes..."
							testId="admin-students.dialog.note"
						/>
					</div>
				</div>
				<div class="flex justify-end gap-2">
					<Button
						variant="outline"
						onclick={() => (showForm = false)}
						disabled={isSubmitting}
						testId="admin-students.dialog.cancel-button">Cancel</Button
					>
					<Button
						onclick={handleSubmit}
						disabled={isSubmitting}
						aria-label={editingId ? 'Update student' : 'Create student'}
						testId="admin-students.dialog.create-button"
					>
						{isSubmitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Dialog -->
{#if showDelete}
	<div
		data-testid="admin-students.delete-dialog"
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-student-title"
	>
		<div
			class="fixed inset-0 bg-black/50"
			onclick={() => (showDelete = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showDelete = false)}
		></div>
		<div class="bg-background relative w-full max-w-md rounded-lg border p-6 shadow-lg">
			<div class="p-6">
				<h2 id="delete-student-title" class="text-lg font-semibold">Delete Student</h2>
				<div class="py-4">
					{#if deleteHasRelated}
						<div
							role="alert"
							class="mb-4 rounded bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-200"
						>
							<p class="font-medium">
								This student has {relatedCount} evaluation record{relatedCount !== 1 ? 's' : ''}.
							</p>
							<p class="mt-1">
								Deleting will permanently remove all evaluation history. Recommended action is to
								set the student to "Not Enrolled".
							</p>
						</div>
					{:else}
						<p class="text-muted-foreground">
							Are you sure you want to delete <strong>{studentToDelete?.englishName}</strong>
							({studentToDelete?.studentId})? This action cannot be undone.
						</p>
					{/if}
				</div>
				<div class="flex justify-end gap-2">
					<Button
						variant="outline"
						testId="admin-students.delete-dialog.cancel"
						onclick={() => (showDelete = false)}>Cancel</Button
					>
					{#if deleteHasRelated}
						<Button
							variant="default"
							testId="admin-students.delete-dialog.set-not-enrolled"
							onclick={() => {
								handleSetNotEnrolled();
								showDelete = false;
							}}>Set Not Enrolled</Button
						>
						<Button
							variant="destructive"
							testId="admin-students.delete-dialog.delete-anyway"
							onclick={() => {
								handleDelete();
								showDelete = false;
							}}>Delete Anyway</Button
						>
					{:else}
						<Button
							variant="destructive"
							testId="admin-students.delete-dialog.delete"
							onclick={() => {
								handleDelete();
								showDelete = false;
							}}>Delete</Button
						>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Import Dialog -->
{#if showImport}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-students-title"
	>
		<div
			class="fixed inset-0 bg-black/50"
			onclick={() => {
				showImport = false;
				importFile = null;
				importPreview = [];
				importResult = null;
			}}
			role="button"
			tabindex="0"
			onkeydown={(e) =>
				e.key === 'Escape' &&
				((showImport = false), (importFile = null), (importPreview = []), (importResult = null))}
		></div>
		<div class="bg-background relative w-full max-w-lg rounded-lg border p-6 shadow-lg">
			<div class="p-6">
				<h2 id="import-students-title" class="text-lg font-semibold">Import Students from Excel</h2>
				<div class="grid gap-4 py-4">
					<p class="text-muted-foreground text-sm">
						Upload a CSV file. <strong>Required:</strong> Student ID, English Name, Chinese Name,
						Grade-Class. <strong>Optional:</strong> House, Note.
						<a
							href="/example-import.csv"
							download
							class="ml-1 text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
							>Download example</a
						>
					</p>
					<div class="space-y-2">
						<Label for="importMode">On duplicate student ID:</Label>
						<NativeSelect.Root bind:value={importMode}>
							<NativeSelect.Option value="halt">Halt with error</NativeSelect.Option>
							<NativeSelect.Option value="skip">Skip duplicates</NativeSelect.Option>
							<NativeSelect.Option value="update">Update existing</NativeSelect.Option>
						</NativeSelect.Root>
					</div>
					<div class="space-y-2">
						<Label for="file">CSV File</Label>
						<Button variant="outline" onclick={() => fileInput?.click()}>
							{importFile ? importFile.name : 'Choose File'}
						</Button>
						<input
							bind:this={fileInput}
							type="file"
							accept=".csv"
							class="hidden"
							onchange={(e) => {
								const target = e.target as HTMLInputElement;
								importFile = target.files?.[0] || null;
								if (importFile) handleImportPreview();
							}}
						/>
					</div>
					{#if importPreview.length > 0}
						<div class="bg-muted rounded p-3 text-sm">
							<p class="mb-2 font-medium">Preview (first 10 rows):</p>
							<div class="max-h-40 overflow-auto">
								<table class="w-full text-xs">
									<thead>
										<tr>
											{#each Object.keys(importPreview[0]) as header (header)}
												<th class="text-left">{header}</th>
											{/each}
										</tr>
									</thead>
									<tbody>
										{#each importPreview as row (row)}
											<tr>
												{#each Object.values(row) as value (value)}
													<td class="pr-2">{value}</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}

					{#if importResult}
						<div
							class="rounded p-3 text-sm"
							class:bg-green-50={importResult.errors.length === 0}
							class:bg-red-50={importResult.errors.length > 0}
							class:dark:bg-green-950={importResult.errors.length === 0}
							class:dark:bg-red-950={importResult.errors.length > 0}
						>
							{#if importResult.errors.length === 0}
								<p class="font-medium text-green-700 dark:text-green-300">
									Imported {importResult.created.length} students
									{importResult.updated.length > 0
										? `, updated ${importResult.updated.length}`
										: ''}
									{importResult.skipped.length > 0
										? `, skipped ${importResult.skipped.length}`
										: ''}
								</p>
							{:else}
								<p class="font-medium text-red-700 dark:text-red-300">
									Import completed with {importResult.errors.length} error(s)
								</p>
								{#if importResult.errors.length > 0}
									<div class="mt-2">
										<p class="font-medium text-red-600 dark:text-red-300">Errors:</p>
										<ul class="list-disc pl-4">
											{#each importResult.errors as e, idx (`${e.studentId}-${idx}`)}
												<li>
													Student ID "{e.studentId}": {e.reason}
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							{/if}
						</div>
					{/if}
					{#if importError}
						<div
							class="rounded bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
						>
							{importError}
						</div>
					{/if}
				</div>
				<div class="flex justify-end gap-2">
					<Button
						variant="outline"
						onclick={() => {
							showImport = false;
							importFile = null;
							importPreview = [];
							importResult = null;
						}}>Cancel</Button
					>
					<Button onclick={handleImport} disabled={!importFile || isImporting}
						>{isImporting ? 'Importing...' : 'Import'}</Button
					>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Disable Student Confirmation Dialog -->
{#if showDisable}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="disable-student-title"
	>
		<div
			class="fixed inset-0 bg-black/50"
			onclick={() => (showDisable = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showDisable = false)}
		></div>
		<div class="bg-background relative w-full max-w-md rounded-lg border p-6 shadow-lg">
			<div class="p-6">
				<h2 id="disable-student-title" class="text-lg font-semibold">Disable Student?</h2>
				<div class="py-4">
					<p class="text-muted-foreground">
						Mark <strong>{studentToDisable?.englishName}</strong> ({studentToDisable?.studentId}) as
						"Not Enrolled"?
					</p>
					<p class="mt-2 text-sm text-orange-600 dark:text-orange-400">
						Teachers will no longer be able to see or create evaluations for this student.
					</p>
				</div>
				<div class="flex justify-end gap-2">
					<Button variant="outline" onclick={() => (showDisable = false)}>Cancel</Button>
					<Button
						onclick={() => {
							handleDisable();
							showDisable = false;
						}}>Confirm</Button
					>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.students-scroll :global([data-slot='table-container']) {
		overflow-x: clip;
	}
</style>
