<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { UserPlus, UserX, UserCheck, X } from '@lucide/svelte';

	const client = useConvexClient();

	const cohortsQuery = useQuery(api.esl.cohorts.list, () => ({}));

	let selectedCohortId = $state<Id<'esl_cohorts'> | ''>('');
	let includeDisabled = $state(true);

	// The roster query is skipped until a cohort is chosen: its `cohortId` arg is
	// required, so there is nothing sensible to send before then.
	const studentsQuery = useQuery(api.esl.students.listByCohort, () =>
		selectedCohortId ? { cohortId: selectedCohortId, includeDisabled } : 'skip'
	);

	const cohorts = $derived(cohortsQuery.data ?? []);
	const students = $derived(studentsQuery.data ?? []);
	const activeStudents = $derived(students.filter((s) => s.status === 'active'));

	// Manual enrolment
	let englishName = $state('');
	let chineseName = $state('');
	let schoolStudentId = $state('');
	let enrolling = $state(false);
	let formError = $state('');
	let notice = $state('');

	// Transfer status
	let pendingTransfer = $state<{ id: Id<'esl_students'>; name: string } | null>(null);
	let transferReason = $state('');
	let transferring = $state(false);
	let transferError = $state('');

	let busyId = $state<string | null>(null);

	function cohortLabelFor(id: Id<'esl_cohorts'>): string {
		return cohorts.find((c) => c._id === id)?.label ?? 'cohort';
	}

	async function enrol(event: SubmitEvent) {
		event.preventDefault();
		formError = '';
		notice = '';
		if (!selectedCohortId) {
			formError = 'Choose a cohort first';
			return;
		}
		enrolling = true;
		try {
			await client.mutation(api.esl.students.create, {
				cohortId: selectedCohortId,
				englishName: englishName.trim(),
				chineseName: chineseName.trim(),
				schoolStudentId: schoolStudentId.trim()
			});
			notice = `Enrolled ${englishName.trim()} into ${cohortLabelFor(selectedCohortId)}`;
			englishName = '';
			chineseName = '';
			schoolStudentId = '';
		} catch (error) {
			formError = error instanceof Error ? error.message : 'Could not enrol the student';
		} finally {
			enrolling = false;
		}
	}

	/**
	 * What to call a student in the roster.
	 *
	 * A student may have no English name yet — a G7 intake arrives before the names
	 * are filled in — so their Chinese name stands in rather than leaving a blank
	 * cell in a table people scan to find someone.
	 */
	function studentName(student: { englishName?: string; chineseName: string }): string {
		return student.englishName ?? student.chineseName;
	}

	function openTransfer(id: Id<'esl_students'>, name: string) {
		pendingTransfer = { id, name };
		transferReason = '';
		transferError = '';
	}

	function closeTransfer() {
		if (transferring) return;
		pendingTransfer = null;
		transferReason = '';
		transferError = '';
	}

	async function confirmTransfer() {
		if (!pendingTransfer) return;
		transferError = '';
		if (!transferReason.trim()) {
			// Mirrors `statusTransitionBlocker`: the reason is the transfer record.
			transferError = 'A status reason is required when disabling a student';
			return;
		}
		transferring = true;
		try {
			await client.mutation(api.esl.students.updateStatus, {
				id: pendingTransfer.id,
				status: 'disabled',
				statusReason: transferReason.trim()
			});
			notice = `${pendingTransfer.name} transferred out`;
			pendingTransfer = null;
			transferReason = '';
		} catch (error) {
			transferError = error instanceof Error ? error.message : 'Could not record the transfer';
		} finally {
			transferring = false;
		}
	}

	async function reactivate(id: Id<'esl_students'>, name: string) {
		busyId = id;
		notice = '';
		try {
			await client.mutation(api.esl.students.updateStatus, { id, status: 'active' });
			notice = `${name} re-enrolled`;
		} catch (error) {
			notice = error instanceof Error ? error.message : 'Could not re-enrol the student';
		} finally {
			busyId = null;
		}
	}
</script>

<div class="mx-auto w-full max-w-6xl space-y-8 p-8">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 data-testid="esl-admin-students.title" class="text-2xl font-bold text-emerald-900">
				Students
			</h1>
			<p class="text-muted-foreground mt-1">
				Rosters belong to a cohort, and a G7/G8 CLIL class and its Comm partner share one roster.
				Transfers are recorded in place so a cohort's history stays readable.
			</p>
		</div>
		<div class="flex items-end gap-3">
			<div class="space-y-1">
				<Label for="esl-students-cohort">Cohort</Label>
				<NativeSelect.Root
					id="esl-students-cohort"
					data-testid="esl-admin-students.cohort"
					bind:value={selectedCohortId}
				>
					<NativeSelect.Option value="">Select a cohort…</NativeSelect.Option>
					{#each cohorts as cohort (cohort._id)}
						<NativeSelect.Option value={cohort._id}>{cohort.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
			<label class="flex items-center gap-2 pb-2 text-sm">
				<input
					type="checkbox"
					data-testid="esl-admin-students.include-disabled"
					bind:checked={includeDisabled}
				/>
				Show transfers out
			</label>
		</div>
	</header>

	{#if notice}
		<p
			data-testid="esl-admin-students.notice"
			class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
		>
			{notice}
		</p>
	{/if}

	<section
		aria-labelledby="esl-admin-students-add-heading"
		class="rounded-lg border bg-white p-6 shadow-sm"
		data-testid="esl-admin-students.add"
	>
		<h2 id="esl-admin-students-add-heading" class="text-lg font-semibold">Enrol a student</h2>
		<form class="mt-4 grid gap-4 sm:grid-cols-3" onsubmit={enrol}>
			<div class="space-y-1">
				<Label for="esl-student-english">English name</Label>
				<Input
					id="esl-student-english"
					data-testid="esl-admin-students.form.englishName"
					bind:value={englishName}
					required
				/>
			</div>
			<div class="space-y-1">
				<Label for="esl-student-chinese">Chinese name</Label>
				<Input
					id="esl-student-chinese"
					data-testid="esl-admin-students.form.chineseName"
					bind:value={chineseName}
					required
				/>
			</div>
			<div class="space-y-1">
				<Label for="esl-student-id">School student ID</Label>
				<Input
					id="esl-student-id"
					data-testid="esl-admin-students.form.schoolStudentId"
					bind:value={schoolStudentId}
					inputmode="numeric"
					placeholder="7001001"
					required
				/>
			</div>
			<div class="flex items-end gap-3 sm:col-span-3">
				<Button
					type="submit"
					disabled={enrolling || !selectedCohortId}
					testId="esl-admin-students.form.submit"
				>
					<UserPlus class="size-4" />
					{enrolling ? 'Enrolling…' : 'Enrol student'}
				</Button>
				{#if !selectedCohortId}
					<p data-testid="esl-admin-students.form.hint" class="text-muted-foreground text-sm">
						Choose a cohort first — a roster belongs to one.
					</p>
				{:else if formError}
					<p data-testid="esl-admin-students.form.error" class="text-sm text-red-700">
						{formError}
					</p>
				{/if}
			</div>
		</form>
	</section>

	<section
		aria-labelledby="esl-admin-students-import-heading"
		class="rounded-lg border bg-white p-6 shadow-sm"
		data-testid="esl-admin-students.import"
	>
		<h2 id="esl-admin-students-import-heading" class="text-lg font-semibold">Import a roster</h2>
		<p class="text-muted-foreground mt-1 text-sm">
			Rosters come in as a workbook, one sheet per class, and
			<a
				class="font-medium underline"
				href="/esl/admin/import"
				data-testid="esl-admin-students.import.link"
			>
				the import page
			</a>
			reads it. It takes the class each student belongs to from the sheet they are on, which a pasted
			list of names cannot say — so a column of names pasted here leaves every student's class unassigned.
			Use it to add one student to a class you have already chosen above.
		</p>
	</section>

	<section aria-labelledby="esl-admin-students-roster-heading" class="space-y-4">
		<h2 id="esl-admin-students-roster-heading" class="text-lg font-semibold">
			Roster
			<span data-testid="esl-admin-students.active-count" class="text-muted-foreground font-normal">
				({activeStudents.length} active)
			</span>
		</h2>

		{#if !selectedCohortId}
			<p
				class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
				data-testid="esl-admin-students.no-cohort"
			>
				Choose a cohort to see its roster.
			</p>
		{:else if studentsQuery.isLoading}
			<p class="text-muted-foreground py-8 text-center" data-testid="esl-admin-students.loading">
				Loading roster…
			</p>
		{:else if students.length === 0}
			<p
				class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
				data-testid="esl-admin-students.empty"
			>
				This cohort has no students yet.
			</p>
		{:else}
			<Table.Root class="rounded-lg border bg-white">
				<Table.Header>
					<Table.Row>
						<Table.Head>English name</Table.Head>
						<Table.Head>Chinese name</Table.Head>
						<Table.Head>School student ID</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Reason</Table.Head>
						<Table.Head class="text-right">Transfer</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each students as student (student._id)}
						<Table.Row data-testid="esl-admin-students.row">
							<Table.Cell class="font-medium">{studentName(student)}</Table.Cell>
							<Table.Cell>{student.chineseName}</Table.Cell>
							<Table.Cell>{student.schoolStudentId}</Table.Cell>
							<Table.Cell>
								<Badge variant={student.status === 'active' ? 'default' : 'secondary'}>
									{student.status}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">
								{student.statusReason ?? '—'}
							</Table.Cell>
							<Table.Cell class="text-right">
								{#if student.status === 'active'}
									<Button
										variant="outline"
										size="sm"
										onclick={() => openTransfer(student._id, studentName(student))}
										testId="esl-admin-students.transfer"
									>
										<UserX class="size-4" />
										Transfer out
									</Button>
								{:else}
									<Button
										variant="outline"
										size="sm"
										disabled={busyId === student._id}
										onclick={() => reactivate(student._id, studentName(student))}
										testId="esl-admin-students.reactivate"
									>
										<UserCheck class="size-4" />
										Re-enrol
									</Button>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</section>
</div>

{#if pendingTransfer}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
		aria-labelledby="esl-admin-students-transfer-title"
		data-testid="esl-admin-students.transfer-dialog"
	>
		<div class="bg-background w-full max-w-md rounded-lg p-6 shadow-lg">
			<div class="flex items-start justify-between">
				<h2 id="esl-admin-students-transfer-title" class="text-xl font-semibold">
					Record a transfer
				</h2>
				<Button
					variant="ghost"
					size="icon"
					onclick={closeTransfer}
					aria-label="Cancel transfer"
					testId="esl-admin-students.transfer-dialog.cancel"
				>
					<X class="size-4" />
				</Button>
			</div>
			<p class="text-muted-foreground mt-2 text-sm">
				<span class="font-medium">{pendingTransfer.name}</span> stays in this cohort's history, marked
				as transferred out. The reason is required and is kept on the record.
			</p>
			<label class="mt-4 block text-sm font-medium" for="esl-transfer-reason">Status reason</label>
			<Input
				id="esl-transfer-reason"
				data-testid="esl-admin-students.transfer.reason"
				bind:value={transferReason}
				placeholder="Transferred to …"
			/>
			{#if transferError}
				<p
					data-testid="esl-admin-students.transfer.error"
					class="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
				>
					{transferError}
				</p>
			{/if}
			<div class="mt-4 flex justify-end gap-2">
				<Button
					variant="outline"
					onclick={closeTransfer}
					testId="esl-admin-students.transfer-dialog.dismiss">Cancel</Button
				>
				<Button
					onclick={confirmTransfer}
					disabled={transferring}
					testId="esl-admin-students.transfer.confirm"
				>
					{transferring ? 'Saving…' : 'Record transfer'}
				</Button>
			</div>
		</div>
	</div>
{/if}
