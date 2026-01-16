<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { Plus, Trash2, Pencil, Search, Upload, AlertTriangle } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import Label from '$lib/components/ui/label/label.svelte';

	type Student = {
		_id: Id<'students'>;
		_creationTime: number;
		englishName: string;
		chineseName: string;
		studentId: string;
		grade: number;
		status: 'Enrolled' | 'Not Enrolled' | 'Graduated';
		note: string;
	};

	const apiAny = api as any;

	let currentUser = useQuery(api.users.viewer, {});
	let studentsQuery = useQuery(apiAny.students.list, {});
	let client = useConvexClient();

	let searchQuery = $state('');
	let selectedGrade = $state<string>('');
	let selectedStatus = $state<string>('');

	// Dialog visibility
	let showForm = $state(false);
	let showDelete = $state(false);
	let showImport = $state(false);
	let showDisable = $state(false);

	// Form state
	let editingId = $state<Id<'students'> | null>(null);
	let originalStatus = $state<'Enrolled' | 'Not Enrolled' | 'Graduated' | null>(null);
	let formStudentId = $state('');
	let formEnglishName = $state('');
	let formChineseName = $state('');
	let formGrade = $state(7);
	let formGradeStr = $state('7');
	let formStatus = $state<'Enrolled' | 'Not Enrolled' | 'Graduated'>('Enrolled');
	let formNote = $state('');
	let isSubmitting = $state(false);
	let formError = $state('');

	// Delete dialog state
	let studentToDelete = $state<any>(null);
	let deleteHasRelated = $state(false);
	let relatedCount = $state(0);

	// Disable student state
	let studentToDisable = $state<any>(null);

	// Import dialog state
	let importMode = $state<'halt' | 'skip' | 'update'>('halt');
	let importFile = $state<File | null>(null);
	let importPreview = $state<any[]>([]);
	let importResult = $state<any>(null);
	let isImporting = $state(false);
	let importError = $state('');

	const grades = [7, 8, 9, 10, 11, 12];
	const statuses = ['Enrolled', 'Not Enrolled', 'Graduated'] as const;

	$effect(() => {
		if (browser && currentUser.isLoading === false) {
			if (currentUser.data?.role !== 'admin' && currentUser.data?.role !== 'super') {
				goto('/');
			}
		}
	});

	function startAdd() {
		formStudentId = '';
		formEnglishName = '';
		formChineseName = '';
		formGrade = 7;
		formGradeStr = '7';
		formStatus = 'Enrolled';
		formNote = '';
		editingId = null;
		formError = '';
	}

	function startEdit(student: any) {
		formStudentId = student.studentId;
		formEnglishName = student.englishName;
		formChineseName = student.chineseName || '';
		formGrade = student.grade;
		formGradeStr = student.grade.toString();
		formStatus = student.status || 'Enrolled';
		formNote = student.note || '';
		originalStatus = student.status;
		editingId = student._id;
		formError = '';
	}

	async function handleSubmit() {
		formError = '';

		if (!formStudentId.trim()) {
			formError = 'Student ID is required';
			return;
		}
		if (!formEnglishName.trim()) {
			formError = 'English name is required';
			return;
		}

		isSubmitting = true;
		try {
			if (editingId) {
				await client.mutation(apiAny.students.update, {
					id: editingId,
					englishName: formEnglishName.trim(),
					chineseName: formChineseName.trim(),
					studentId: formStudentId.trim(),
					grade: formGrade,
					status: formStatus,
					note: formNote.trim()
				});
			} else {
				await client.mutation(apiAny.students.create, {
					englishName: formEnglishName.trim(),
					chineseName: formChineseName.trim(),
					studentId: formStudentId.trim(),
					grade: formGrade,
					status: formStatus,
					note: formNote.trim()
				});
			}
			showForm = false;
		} catch (e: any) {
			formError = e.message || 'Failed to save student';
		} finally {
			isSubmitting = false;
		}
	}

	async function confirmDelete(student: any) {
		studentToDelete = student;

		const related = await client.query(apiAny.students.checkStudentHasEvaluations, {
			id: student._id
		});
		deleteHasRelated = related.hasEvaluations;
		relatedCount = related.count;
	}

	async function handleSetNotEnrolled() {
		if (!studentToDelete) return;
		await client.mutation(apiAny.students.disableStudent, { id: studentToDelete._id });
		studentToDelete = null;
		showDelete = false;
	}

	async function handleDelete() {
		if (!studentToDelete) return;

		try {
			if (deleteHasRelated) {
				await client.mutation(apiAny.students.removeWithCascade, { id: studentToDelete._id });
			} else {
				await client.mutation(apiAny.students.remove, { id: studentToDelete._id });
			}
			studentToDelete = null;
			showDelete = false;
		} catch (e: any) {
			alert('Failed to delete: ' + e.message);
		}
	}

	function confirmDisable(student: any) {
		studentToDisable = student;
	}

	async function handleDisable() {
		if (!studentToDisable) return;
		await client.mutation(apiAny.students.disableStudent, { id: studentToDisable._id });
		studentToDisable = null;
		showDisable = false;
	}

	async function handleImportPreview() {
		if (!importFile) return;

		// Simple CSV parsing
		const text = await importFile.text();
		const lines = text.trim().split('\n');
		const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

		const preview = [];
		for (let i = 1; i < lines.length && i <= 10; i++) {
			const values = lines[i].split(',').map((v) => v.trim());
			const row: any = {};
			headers.forEach((h, idx) => (row[h] = values[idx]));
			preview.push(row);
		}
		importPreview = preview;
	}

	async function handleImport() {
		if (!importFile) return;

		isImporting = true;
		importResult = null;
		importError = '';

		try {
			const text = await importFile.text();
			const lines = text.trim().split('\n');
			const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

			const students = [];
			for (let i = 1; i < lines.length; i++) {
				const values = lines[i].split(',').map((v) => v.trim());
				const row: any = {};
				headers.forEach((h, idx) => (row[h] = values[idx]));
				students.push({
					englishName: row.englishname || row.name || '',
					chineseName: row.chinesename || row.chinese || '',
					studentId: row.studentid || row.id || '',
					grade: parseInt(row.grade) || 7,
					status: (row.status as 'Enrolled' | 'Not Enrolled' | 'Graduated') || 'Enrolled',
					note: row.note || ''
				});
			}

			const result = await client.mutation(apiAny.students.bulkImportWithDuplicateCheck, {
				students,
				mode: importMode
			});

			importResult = result;
			if (result.success) {
				showImport = false;
				importFile = null;
				importPreview = [];
				importResult = null;
			}
		} catch (e: any) {
			importError = e.message || 'Import failed';
		} finally {
			isImporting = false;
		}
	}

	const filteredStudents = $derived(
		studentsQuery.data?.filter((s: Student) => {
			if (selectedStatus && s.status !== selectedStatus) return false;
			if (selectedGrade && s.grade !== parseInt(selectedGrade)) return false;
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
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<Button variant="outline" onclick={() => goto('/admin')}>← Back to Admin</Button>
					<h1 class="text-foreground text-2xl font-bold">Student Management</h1>
				</div>
				<div class="flex items-center gap-2">
					<ThemeToggle />
					<Button
						variant="outline"
						onclick={() => {
							showImport = true;
						}}
					>
						<Upload class="mr-2 h-4 w-4" />
						Import
					</Button>
					<Button
						variant="outline"
						onclick={() => {
							startAdd();
							showForm = true;
						}}
					>
						<Plus class="mr-2 h-4 w-4" />
						Add Student
					</Button>
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
		<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="relative max-w-md flex-1">
				<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
				<Input
					placeholder="Search by name or student ID..."
					class="pl-9"
					bind:value={searchQuery}
				/>
			</div>
			<div class="flex gap-2">
				<NativeSelect.Root bind:value={selectedGrade}>
					<NativeSelect.Option value="">All Grades</NativeSelect.Option>
					{#each grades as grade}
						<NativeSelect.Option value={grade.toString()}>Grade {grade}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
				<NativeSelect.Root bind:value={selectedStatus}>
					<NativeSelect.Option value="">All Status</NativeSelect.Option>
					{#each statuses as status}
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
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Student ID</Table.Head>
						<Table.Head>English Name</Table.Head>
						<Table.Head>Chinese Name</Table.Head>
						<Table.Head>Grade</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Note</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filteredStudents as student}
						<Table.Row>
							<Table.Cell class="font-medium">{student.studentId}</Table.Cell>
							<Table.Cell>{student.englishName}</Table.Cell>
							<Table.Cell>{student.chineseName}</Table.Cell>
							<Table.Cell>{student.grade}</Table.Cell>
							<Table.Cell>
								<Badge
									variant={student.status === 'Enrolled'
										? 'default'
										: student.status === 'Graduated'
											? 'secondary'
											: 'outline'}
								>
									{student.status}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground max-w-xs truncate text-sm"
								>{student.note || '-'}</Table.Cell
							>
							<Table.Cell class="text-right">
								<div class="flex justify-end gap-1">
									<Button
										variant="ghost"
										size="icon"
										onclick={() => {
											startEdit(student);
											showForm = true;
										}}
									>
										<Pencil class="h-4 w-4" />
									</Button>
									{#if student.status === 'Enrolled'}
										<Button
											variant="ghost"
											size="icon"
											onclick={() => {
												confirmDisable(student);
												showDisable = true;
											}}
											title="Disable student"
										>
											<AlertTriangle class="h-4 w-4 text-orange-500" />
										</Button>
									{/if}
									<Button
										variant="ghost"
										size="icon"
										onclick={() => {
											confirmDelete(student);
											showDelete = true;
										}}
									>
										<Trash2 class="h-4 w-4 text-red-500" />
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
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="fixed inset-0 bg-black/50"
			onclick={() => (showForm = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showForm = false)}
		></div>
		<div class="bg-background relative w-full max-w-lg rounded-lg border p-6 shadow-lg">
			<div class="p-6">
				<h2 class="text-lg font-semibold">{editingId ? 'Edit Student' : 'Add New Student'}</h2>
				<div class="grid gap-4 py-4">
					{#if formError}
						<div
							class="rounded bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
						>
							{formError}
						</div>
					{/if}
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<Label for="studentId">Student ID *</Label>
							<Input id="studentId" bind:value={formStudentId} placeholder="e.g., S1001" />
						</div>
						<div class="space-y-2">
							<Label for="grade">Grade *</Label>
							<NativeSelect.Root
								bind:value={formGradeStr}
								onchange={(e) => {
									const target = e.target as HTMLSelectElement;
									formGrade = Number(target.value);
									formGradeStr = target.value;
								}}
							>
								<NativeSelect.Option value="" disabled>Select grade</NativeSelect.Option>
								{#each grades as grade}
									<NativeSelect.Option value={grade.toString()}>{grade}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
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
						<NativeSelect.Root bind:value={formStatus}>
							<NativeSelect.Option value="" disabled>Select status</NativeSelect.Option>
							{#each statuses as status}
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
					<Button onclick={handleSubmit} disabled={isSubmitting}>
						{isSubmitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Dialog -->
{#if showDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="fixed inset-0 bg-black/50"
			onclick={() => (showDelete = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showDelete = false)}
		></div>
		<div class="bg-background relative w-full max-w-md rounded-lg border p-6 shadow-lg">
			<div class="p-6">
				<h2 class="text-lg font-semibold">Delete Student</h2>
				<div class="py-4">
					{#if deleteHasRelated}
						<div
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
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
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
				<h2 class="text-lg font-semibold">Import Students from Excel</h2>
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
											{#each Object.keys(importPreview[0]) as header}
												<th class="text-left">{header}</th>
											{/each}
										</tr>
									</thead>
									<tbody>
										{#each importPreview as row}
											<tr>
												{#each Object.values(row) as value}
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
							class:bg-green-50={importResult.success}
							class:bg-red-50={!importResult.success}
							class:dark:bg-green-950={importResult.success}
							class:dark:bg-red-950={!importResult.success}
						>
							{#if importResult.success}
								<p class="font-medium text-green-700 dark:text-green-300">{importResult.summary}</p>
							{:else}
								<p class="font-medium text-red-700 dark:text-red-300">{importResult.message}</p>
								{#if importResult.duplicates}
									<ul class="mt-2 list-disc pl-4">
										{#each importResult.duplicates as d}
											<li>{d.studentId}: existing="{d.existingStudent}", new="{d.newStudent}"</li>
										{/each}
									</ul>
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
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="fixed inset-0 bg-black/50"
			onclick={() => (showDisable = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showDisable = false)}
		></div>
		<div class="bg-background relative w-full max-w-md rounded-lg border p-6 shadow-lg">
			<div class="p-6">
				<h2 class="text-lg font-semibold">Disable Student?</h2>
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
