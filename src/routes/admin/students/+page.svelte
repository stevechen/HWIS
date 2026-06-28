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
		CircleQuestionMark
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import Label from '$lib/components/ui/label/label.svelte';
	import { onMount } from 'svelte';

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
		note?: string;
	};

	const studentsApi = api.students;
	const studentsQuery = useQuery(studentsApi.list, () => ({}));
	const classesApi = api.classes;
	const classesQuery = useQuery(classesApi.list, () => ({}));
	const client = useConvexClient();

	// Automatically seed default classes (G#-1 and G#-IB) when page loads
	onMount(async () => {
		try {
			await client.mutation(api.classes.seedDefaultClasses, {});
		} catch {
			// Ignore errors - classes may already exist
		}
	});

	let searchQuery = $state('');
	let selectedGrade = $state<string>('');
	let selectedStatus = $state<string>('');
	let selectedClass = $state<string>('');

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
	let importPreview = $state<Record<string, string>[]>([]);
	let importResult = $state<{
		created: string[];
		updated: string[];
		skipped: string[];
		errors: { studentId: string; reason: string }[];
	} | null>(null);
	let isImporting = $state(false);
	let importError = $state('');

	type ParsedCsvRow = Record<string, string>;

	// Duplicate check state
	let isCheckingId = $state(false);
	let idAvailability = $state<'available' | 'taken' | 'unknown'>('unknown');

	const grades = [7, 8, 9, 10, 11, 12];
	const statuses = ['Enrolled', 'Not Enrolled'] as const;

	// Type for class records from the API
	type ClassRecord = {
		_id: Id<'classes'>;
		grade: number;
		class: string;
		homeroomTeacherId?: Id<'users'>;
		homeroomTeacherName?: string | null;
	};

	// Group classes by grade for display name logic
	const classesByGrade = $derived.by(() => {
		const classes = classesQuery.data || [];
		const grouped: Record<number, ClassRecord[]> = {};
		for (const grade of grades) {
			grouped[grade] = classes.filter((c) => c.grade === grade);
		}
		return grouped;
	});

	// Helper function to get display name for a class
	// default -> "7", "1" -> "7-1" (or "7" if only "1" and "IB" exist), "IB" -> "7-IB"
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

	// Combined grade-class options for the form dropdown
	let gradeClassOptions = $derived.by(() => {
		if (!classesQuery.data || classesQuery.data.length === 0) {
			// No classes available - return empty array
			return [];
		}
		return classesQuery.data.map((c) => ({
			value: `${c.grade}-${c.class}`,
			label: getDisplayName(c.grade, c.class, classesByGrade[c.grade]),
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

	function normalizeHeader(header: string): string {
		return header
			.trim()
			.toLowerCase()
			.replace(/^\ufeff/, '')
			.replace(/[^a-z0-9]/g, '');
	}

	function parseCsv(text: string): ParsedCsvRow[] {
		const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
		const rows: string[][] = [];
		let currentRow: string[] = [];
		let currentCell = '';
		let inQuotes = false;

		for (let i = 0; i < normalized.length; i++) {
			const char = normalized[i];
			const nextChar = normalized[i + 1];

			if (char === '"') {
				if (inQuotes && nextChar === '"') {
					currentCell += '"';
					i++;
				} else {
					inQuotes = !inQuotes;
				}
				continue;
			}

			if (char === ',' && !inQuotes) {
				currentRow.push(currentCell);
				currentCell = '';
				continue;
			}

			if (char === '\n' && !inQuotes) {
				currentRow.push(currentCell);
				rows.push(currentRow);
				currentRow = [];
				currentCell = '';
				continue;
			}

			currentCell += char;
		}

		// Flush final row
		if (currentCell.length > 0 || currentRow.length > 0) {
			currentRow.push(currentCell);
			rows.push(currentRow);
		}

		if (rows.length === 0) {
			return [];
		}

		const headers = rows[0].map((h) => normalizeHeader(h));
		const dataRows: ParsedCsvRow[] = [];
		for (let i = 1; i < rows.length; i++) {
			const rowValues = rows[i];
			if (rowValues.every((v) => v.trim() === '')) {
				continue;
			}
			const row: ParsedCsvRow = {};
			for (let j = 0; j < headers.length; j++) {
				row[headers[j]] = (rowValues[j] ?? '').trim();
			}
			dataRows.push(row);
		}
		return dataRows;
	}

	function mapCsvRowToStudent(row: ParsedCsvRow): {
		englishName: string;
		chineseName: string;
		studentId: string;
		grade: number;
		class?: string;
		note?: string;
		status?: 'Enrolled' | 'Not Enrolled';
		house?: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna';
	} {
		const englishName = row.englishname || row.name || '';
		const chineseName = row.chinesename || row.chinese || '';
		const studentId = row.studentid || row.id || '';
		const gradeValue = row.grade || '';
		const gradeClass = parseGradeAndClass(gradeValue);
		const rawStatus = (row.status || '').trim();
		let parsedStatus: 'Enrolled' | 'Not Enrolled' | undefined = undefined;
		if (rawStatus.toLowerCase() === 'enrolled') parsedStatus = 'Enrolled';
		if (rawStatus.toLowerCase() === 'not enrolled') parsedStatus = 'Not Enrolled';

		const rawHouse = (row.house || '').trim();
		let parsedHouse: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna' | undefined = undefined;
		if (rawHouse.toLowerCase() === 'heracles') parsedHouse = 'Heracles';
		if (rawHouse.toLowerCase() === 'wukong') parsedHouse = 'Wukong';
		if (rawHouse.toLowerCase() === 'ixbalam') parsedHouse = 'Ixbalam';
		if (rawHouse.toLowerCase() === 'setna') parsedHouse = 'Setna';

		return {
			englishName,
			chineseName,
			studentId,
			grade: gradeClass.grade,
			class: gradeClass.class,
			status: parsedStatus,
			note: row.note || '',
			house: parsedHouse
		};
	}

	function parseGradeAndClass(value: string): { grade: number; class?: string } {
		const cleaned = value.trim();
		if (!cleaned) return { grade: 7, class: '1' };

		const dashMatch = cleaned.match(/^(\d{1,2})\s*-\s*([A-Za-z0-9]+)$/);
		if (dashMatch) {
			const grade = parseInt(dashMatch[1], 10);
			const className = dashMatch[2].toUpperCase() === 'IB' ? 'IB' : dashMatch[2];
			return { grade: Number.isNaN(grade) ? 7 : grade, class: className };
		}

		const gradeOnly = parseInt(cleaned, 10);
		return {
			grade: Number.isNaN(gradeOnly) ? 7 : gradeOnly,
			class: '1'
		};
	}

	const filteredStudents = $derived(
		studentsQuery.data?.filter((s: Student) => {
			if (selectedStatus && s.status !== selectedStatus) return false;
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

<div class="bg-background min-h-screen">
	<header class="bg-card border-b shadow-sm">
		<div class="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-end">
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
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
					>
						<Plus class="mr-2 size-4" />
						Add Student
					</Button>
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
		<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="relative max-w-md flex-1">
				<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
				<Input
					placeholder="Search by name or student ID..."
					class="pl-9"
					bind:value={searchQuery}
					aria-label="Search students"
				/>
			</div>
			<div class="flex gap-2">
				<NativeSelect.Root bind:value={selectedGrade} aria-label="Filter by grade">
					<NativeSelect.Option value="">All Grades</NativeSelect.Option>
					{#each grades as grade (grade)}
						<NativeSelect.Option value={grade.toString()}>Grade {grade}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
				<NativeSelect.Root bind:value={selectedStatus} aria-label="Filter by status">
					<NativeSelect.Option value="">All Status</NativeSelect.Option>
					{#each statuses as status (status)}
						<NativeSelect.Option value={status}>{status}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
		</div>

		{#if studentsQuery.isLoading}
			<div class="text-muted-foreground py-8 text-center">Loading students...</div>
		{:else if studentsQuery.error}
			<div class="py-8 text-center text-red-500">
				Error loading students: {studentsQuery.error.message}
			</div>
		{:else if filteredStudents.length === 0}
			<div class="text-muted-foreground py-8 text-center">
				{searchQuery || selectedGrade || selectedStatus
					? 'No students match your filters'
					: 'No students yet. Add one or import from Excel!'}
			</div>
		{:else}
			<Table.Root aria-label="Student table">
				<Table.Header>
					<Table.Row>
						<Table.Head class="text-center">Student ID</Table.Head>
						<Table.Head>English Name</Table.Head>
						<Table.Head>Chinese Name</Table.Head>
						<Table.Head class="text-center">Grade</Table.Head>

						<Table.Head class="text-center">Status</Table.Head>
						<Table.Head>Note</Table.Head>
						<Table.Head class="text-center">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filteredStudents as student (student._id)}
						<Table.Row
							class={`${student.status === 'Not Enrolled' && 'bg-muted-foreground opacity-60'}`}
						>
							<Table.Cell class="text-center">{student.studentId}</Table.Cell>
							<Table.Cell>{student.englishName}</Table.Cell>
							<Table.Cell>{student.chineseName}</Table.Cell>
							<Table.Cell class="text-center"
								>{student.classInfo
									? getDisplayName(
											student.classInfo.grade,
											student.classInfo.class,
											classesByGrade[student.classInfo.grade]
										)
									: '-'}</Table.Cell
							>
							<Table.Cell class="text-center">
								<Button
									variant="ghost"
									size="sm"
									onclick={() =>
										client.mutation(studentsApi.changeStatus, {
											id: student._id,
											status: student.status === 'Enrolled' ? 'Not Enrolled' : 'Enrolled'
										})}
									aria-label="Toggle {student.studentId} status"
									class="cursor-pointer"
								>
									<Badge
										variant={student.status === 'Enrolled' ? 'default' : 'outline'}
										class="hover:ring-primary/50 w-22 hover:ring-2 hover:ring-offset-1"
									>
										{student.status}
									</Badge>
								</Button>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground max-w-xs truncate text-sm"
								>{student.note || '-'}</Table.Cell
							>
							<Table.Cell class="text-center">
								<div class="flex justify-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										onclick={() => {
											startEdit(student);
											showForm = true;
										}}
										aria-label="Edit {student.studentId}"
										class="hover:ring-primary/50 cursor-pointer hover:ring-2 hover:ring-offset-1"
									>
										<Pencil class="size-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onclick={() => {
											confirmDelete(student);
											showDelete = true;
										}}
										aria-label="Delete {student.studentId}"
										class="hover:ring-destructive/50 cursor-pointer hover:ring-2 hover:ring-offset-1"
									>
										<Trash2 class="size-4 text-red-500" />
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</main>
</div>

<!-- Add/Edit Dialog -->
{#if showForm}
	<div
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
						<Label for="englishName">English Name *</Label>
						<Input id="englishName" bind:value={formEnglishName} placeholder="e.g., John Smith" />
					</div>
					<div class="space-y-2">
						<Label for="chineseName">Chinese Name</Label>
						<Input id="chineseName" bind:value={formChineseName} placeholder="e.g., 張三" />
					</div>
					<div class="space-y-2">
						<Label for="status">Status</Label>
						<NativeSelect.Root bind:value={formStatus} aria-label="Student status">
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
						<Input id="note" bind:value={formNote} placeholder="Optional notes..." />
					</div>
				</div>
				<div class="flex justify-end gap-2">
					<Button variant="outline" onclick={() => (showForm = false)} disabled={isSubmitting}
						>Cancel</Button
					>
					<Button
						onclick={handleSubmit}
						disabled={isSubmitting}
						aria-label={editingId ? 'Update student' : 'Create student'}
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
					<Button variant="outline" onclick={() => (showDelete = false)}>Cancel</Button>
					{#if deleteHasRelated}
						<Button
							variant="default"
							onclick={() => {
								handleSetNotEnrolled();
								showDelete = false;
							}}>Set Not Enrolled</Button
						>
						<Button
							variant="destructive"
							onclick={() => {
								handleDelete();
								showDelete = false;
							}}>Delete Anyway</Button
						>
					{:else}
						<Button
							variant="destructive"
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
						Upload a CSV file with columns: englishName, chineseName, studentId, grade, status, note
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
						<Input
							id="file"
							type="file"
							accept=".csv"
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
