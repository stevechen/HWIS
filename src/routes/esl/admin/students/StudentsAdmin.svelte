<script lang="ts">
	import { fly } from 'svelte/transition';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import type { FunctionReturnType } from 'convex/server';
	import { page } from '$app/state';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { deriveGradeForSchoolYear, normalizeSchoolStudentId } from '$convex/shared/esl_import';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { ArrowRight, Check, MoreHorizontal, UserPlus, UserRoundX, X } from '@lucide/svelte';
	import ImportRoster from '$lib/components/esl/roster/ImportRoster.svelte';
	import { schoolYearOf } from '$lib/components/esl/roster/staging';

	const client = useConvexClient();
	const currentSchoolYear = schoolYearOf(new Date());
	let selectedYear = $state(page.url.searchParams.get('year') ?? currentSchoolYear);
	let notice = $state('');
	let error = $state('');

	const overviewQuery = useQuery(api.esl.yearStatus.overview, () =>
		selectedYear ? { year: selectedYear } : 'skip'
	);
	const overview = $derived(overviewQuery.data ?? null);
	const years = $derived(overview?.years ?? [selectedYear]);
	let importOpen = $state(
		page.url.hash === '#import' || page.url.searchParams.get('import') === '1'
	);
	let readinessOpen = $state(false);
	const readinessQuery = useQuery(api.esl.yearStatus.readiness, () =>
		readinessOpen && overview?.hasRoster && !overview.confirmed ? { year: selectedYear } : 'skip'
	);
	const readiness = $derived(readinessQuery.data ?? null);
	let confirmingRoster = $state(false);
	let readinessError = $state('');

	async function confirmRoster() {
		if (!readiness) return;
		confirmingRoster = true;
		readinessError = '';
		try {
			await client.mutation(api.esl.yearStatus.confirm, { year: selectedYear });
			notice = `Roster confirmed for ${selectedYear}`;
			readinessOpen = false;
		} catch (cause) {
			readinessError = cause instanceof Error ? cause.message : 'Could not confirm this roster';
		} finally {
			confirmingRoster = false;
		}
	}

	type SearchHit = FunctionReturnType<typeof api.esl.transfers.search>[number];
	let searchDraft = $state('');
	let searchTerm = $state('');
	let selectedStudentId = $state<Id<'esl_students'> | ''>('');
	const searchQuery = useQuery(api.esl.transfers.search, () =>
		searchTerm ? { year: selectedYear, query: searchTerm, limit: 25 } : 'skip'
	);
	const searchHits = $derived(searchQuery.data ?? []);
	const selectedStudent = $derived(searchHits.find((hit) => hit._id === selectedStudentId));

	function searchStudents(event: SubmitEvent) {
		event.preventDefault();
		searchTerm = searchDraft.trim();
		selectedStudentId = '';
	}

	function changeYear(value: string) {
		selectedYear = value;
		searchDraft = '';
		searchTerm = '';
		selectedStudentId = '';
		notice = '';
	}

	function localDateInputValue(date = new Date()) {
		const yearPart = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${yearPart}-${month}-${day}`;
	}

	let transferDialog = $state(false);
	let effectiveDate = $state(localDateInputValue());
	let transferReason = $state('');
	let transferError = $state('');
	let transferring = $state(false);

	function openTransfer() {
		if (!selectedStudent) return;
		effectiveDate = localDateInputValue();
		transferReason = '';
		transferError = '';
		transferDialog = true;
	}

	function closeTransfer() {
		if (transferring) return;
		transferDialog = false;
	}

	async function confirmTransfer() {
		if (!selectedStudent) return;
		transferError = '';
		if (!effectiveDate) {
			transferError = 'Choose an effective date';
			return;
		}
		if (!transferReason.trim()) {
			transferError = 'Enter a transfer reason';
			return;
		}
		transferring = true;
		try {
			const [yearPart, monthPart, dayPart] = effectiveDate.split('-').map(Number);
			const effectiveAt = new Date(yearPart, monthPart - 1, dayPart, 12).getTime();
			const name = selectedStudent.englishName ?? selectedStudent.chineseName;
			await client.mutation(api.esl.students.updateStatus, {
				id: selectedStudent._id,
				status: 'disabled',
				statusReason: transferReason.trim(),
				effectiveAt
			});
			notice = `${name} transferred out effective ${effectiveDate}`;
			transferDialog = false;
			selectedStudentId = '';
		} catch (cause) {
			transferError = cause instanceof Error ? cause.message : 'Could not record the transfer';
		} finally {
			transferring = false;
		}
	}

	let enrollDialog = $state(false);
	let schoolStudentId = $state('');
	let chineseName = $state('');
	let englishName = $state('');
	let chineseClass = $state('');
	let enrollmentCohortId = $state<Id<'esl_cohorts'> | ''>('');
	let enrolling = $state(false);
	let enrollmentError = $state('');
	const validSchoolStudentId = $derived(normalizeSchoolStudentId(schoolStudentId));
	const gradePlacement = $derived(
		validSchoolStudentId
			? deriveGradeForSchoolYear(selectedYear, [validSchoolStudentId])
			: { kind: 'unknown' as const }
	);
	const enrollmentGrade = $derived(gradePlacement.kind === 'grade' ? gradePlacement.grade : null);
	const enrollmentOptionsQuery = useQuery(api.esl.enrollment.options, () =>
		enrollDialog && enrollmentGrade !== null
			? { year: selectedYear, grade: enrollmentGrade }
			: 'skip'
	);
	const enrollmentOptions = $derived(enrollmentOptionsQuery.data ?? null);
	const eligibleEslClasses = $derived(
		enrollmentOptions?.cohortsByChineseClass.find((option) => option.chineseClass === chineseClass)
			?.cohorts ?? []
	);

	function openEnrollment() {
		if (!overview?.confirmed) return;
		schoolStudentId = '';
		chineseName = '';
		englishName = '';
		chineseClass = '';
		enrollmentCohortId = '';
		enrollmentError = '';
		enrollDialog = true;
	}

	function updateStudentId(value: string) {
		const nextId = normalizeSchoolStudentId(value);
		const nextGrade = nextId ? deriveGradeForSchoolYear(selectedYear, [nextId]) : null;
		const nextGradeValue = nextGrade?.kind === 'grade' ? nextGrade.grade : null;
		if (nextGradeValue !== enrollmentGrade) {
			chineseClass = '';
			enrollmentCohortId = '';
		}
		schoolStudentId = value;
	}

	async function submitEnrollment(event: SubmitEvent) {
		event.preventDefault();
		enrollmentError = '';
		if (!overview?.confirmed) {
			enrollmentError = 'Confirm roster readiness before enrolling a student';
			return;
		}
		if (!validSchoolStudentId || enrollmentGrade === null || !chineseClass || !enrollmentCohortId) {
			enrollmentError = 'Enter a valid student ID and choose both classes';
			return;
		}
		enrolling = true;
		try {
			await client.mutation(api.esl.students.create, {
				cohortId: enrollmentCohortId,
				schoolStudentId: validSchoolStudentId,
				chineseName: chineseName.trim(),
				englishName: englishName.trim(),
				chineseClass
			});
			notice = `Enrolled ${englishName.trim() || chineseName.trim()}`;
			enrollDialog = false;
			if (searchTerm) {
				searchTerm = validSchoolStudentId;
				searchDraft = validSchoolStudentId;
			}
		} catch (cause) {
			enrollmentError = cause instanceof Error ? cause.message : 'Could not enrol this student';
		} finally {
			enrolling = false;
		}
	}

	let pendingMove = $state<{ kind: 'level' | 'homeroom'; hit: SearchHit } | null>(null);
	let moveReason = $state('');
	let moveError = $state('');
	let moveBusy = $state(false);
	let targetCohortId = $state<Id<'esl_cohorts'> | ''>('');
	let newHomeroom = $state('');
	const bandCohortsQuery = useQuery(api.esl.bands.bandCohorts, () =>
		pendingMove?.kind === 'level' ? { cohortId: pendingMove.hit.cohortId } : 'skip'
	);
	const moveTargetCohorts = $derived(
		(bandCohortsQuery.data ?? []).filter(
			(cohort) => cohort.status === 'active' && cohort._id !== pendingMove?.hit.cohortId
		)
	);
	function moveCohortLabel(cohort: { grade: number; level?: string; classNumber: string }) {
		return cohort.grade === 10
			? `H1${cohort.classNumber}${cohort.level ?? ''}`
			: `G${cohort.grade} ${cohort.level ?? ''} ${cohort.classNumber}`.trim();
	}
	const homeroomOptionsQuery = useQuery(api.esl.enrollment.options, () =>
		pendingMove?.kind === 'homeroom' ? { year: selectedYear, grade: pendingMove.hit.grade } : 'skip'
	);
	const homeroomOptions = $derived(homeroomOptionsQuery.data?.chineseClasses ?? []);

	function openMove(kind: 'level' | 'homeroom', hit: SearchHit) {
		pendingMove = { kind, hit };
		moveReason = '';
		moveError = '';
		targetCohortId = '';
		newHomeroom = hit.homeroom;
	}

	function closeMove() {
		if (moveBusy) return;
		pendingMove = null;
	}

	async function confirmMove() {
		if (!pendingMove) return;
		moveError = '';
		if (pendingMove.kind === 'level' && !targetCohortId) {
			moveError = 'Choose the ESL class to move the student into';
			return;
		}
		if (pendingMove.kind === 'homeroom' && !newHomeroom) {
			moveError = 'Choose the Chinese class';
			return;
		}
		moveBusy = true;
		try {
			const move = pendingMove;
			const destination = moveTargetCohorts.find((cohort) => cohort._id === targetCohortId);
			const result =
				move.kind === 'level'
					? await client.mutation(api.esl.transfers.transferLevel, {
							studentId: move.hit._id,
							toCohortId: targetCohortId as Id<'esl_cohorts'>,
							...(moveReason.trim() ? { reason: moveReason.trim() } : {})
						})
					: await client.mutation(api.esl.transfers.transferHomeroom, {
							studentId: move.hit._id,
							chineseClass: newHomeroom,
							...(moveReason.trim() ? { reason: moveReason.trim() } : {})
						});
			notice =
				move.kind === 'level'
					? `${move.hit.englishName ?? move.hit.chineseName} moved to ${destination ? moveCohortLabel(destination) : 'the selected ESL class'}`
					: `${move.hit.englishName ?? move.hit.chineseName}'s Chinese class updated to ${newHomeroom}`;
			if (result.bandChanged) notice += ' — check the class week.';
			pendingMove = null;
		} catch (cause) {
			moveError = cause instanceof Error ? cause.message : 'Could not move the student';
		} finally {
			moveBusy = false;
		}
	}

	const historyQuery = useQuery(api.esl.transfers.history, () =>
		selectedYear ? { year: selectedYear, limit: 20 } : 'skip'
	);
	const transferHistory = $derived(historyQuery.data ?? []);
</script>

<main class="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-8">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
		<div>
			<p class="text-xs font-semibold tracking-[0.16em] text-emerald-800 uppercase">
				ESL · Administration
			</p>
			<h1 class="mt-2 text-3xl font-semibold tracking-tight">Students</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				Enroll students, record transfers, and manage ESL class placement.
			</p>
		</div>
		<div class="space-y-1">
			<Label for="esl-students-year">School year</Label>
			<NativeSelect.Root
				id="esl-students-year"
				value={selectedYear}
				onchange={(event) => changeYear(event.currentTarget.value)}
				data-testid="esl-admin-students.year"
			>
				{#each years as year (year)}<NativeSelect.Option value={year}>{year}</NativeSelect.Option
					>{/each}
			</NativeSelect.Root>
		</div>
	</header>

	<section aria-label="Student actions" class="space-y-3">
		<div class="flex flex-wrap items-center gap-2">
			<Button
				onclick={openEnrollment}
				disabled={!overview?.confirmed}
				title={!overview?.confirmed ? 'Confirm roster readiness to enroll students' : undefined}
				testId="esl-admin-students.enroll"
			>
				<UserPlus class="size-4" /> Enroll student
			</Button>
			<Button
				variant="outline"
				onclick={openTransfer}
				disabled={!selectedStudent}
				testId="esl-admin-students.transfer-selected"
			>
				<UserRoundX class="size-4" />
				{selectedStudent
					? `Transfer out · ${selectedStudent.englishName ?? selectedStudent.chineseName}`
					: 'Select a student to transfer'}
			</Button>
		</div>
		{#if !overviewQuery.isLoading && !overview?.confirmed}
			<p class="text-muted-foreground text-sm">
				{overview?.hasRoster
					? 'Confirm roster readiness before enrolling students.'
					: 'Enrollment opens after this year’s roster is imported and confirmed.'}
			</p>
		{/if}
		{#if notice}
			<p
				class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
				role="status"
				aria-live="polite"
				data-testid="esl-admin-students.notice"
			>
				{notice}
			</p>
		{/if}
	</section>

	{#if overview && !overview.confirmed && !overview.hasRoster}
		<section
			class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
			aria-label="Roster task: import due"
		>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p class="text-xs font-bold tracking-wider uppercase">
						{selectedYear} · yearly roster setup
					</p>
					<h2 class="mt-1 font-semibold">Import this year’s roster</h2>
					<p class="mt-1 text-sm">
						Import the approved roster before reviewing and confirming readiness.
					</p>
				</div>
				<Button variant="outline" onclick={() => (importOpen = !importOpen)}
					>{importOpen ? 'Hide import' : 'Import roster'} <ArrowRight class="size-4" /></Button
				>
			</div>
		</section>
	{/if}
	{#if importOpen}
		<ImportRoster expanded initialYear={selectedYear} />
	{/if}

	{#if overview?.hasRoster && !overview.confirmed}
		<section
			class="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sky-950"
			aria-label="Roster task: confirmation due"
		>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p class="text-xs font-bold tracking-wider uppercase">{selectedYear} · final review</p>
					<h2 class="mt-1 font-semibold">Confirm roster readiness</h2>
					<p class="mt-1 text-sm">
						Review student counts and exceptions, then confirm once for this academic year.
					</p>
				</div>
				<Button onclick={() => (readinessOpen = !readinessOpen)}
					>{readinessOpen ? 'Hide review' : 'Review counts & exceptions'}
					<ArrowRight class="size-4" /></Button
				>
			</div>
			{#if readinessOpen}
				{#if readinessQuery.isLoading}
					<p class="mt-4 text-sm">Loading roster review…</p>
				{:else if readiness}
					<div class="mt-4 space-y-4 border-t border-sky-200 pt-4">
						<dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
							<div class="rounded-lg bg-white/70 p-3">
								<dt class="text-xs">Active students</dt>
								<dd class="mt-1 text-xl font-semibold">{readiness.activeStudents}</dd>
							</div>
							{#each readiness.grades as grade (grade.grade)}<div
									class="rounded-lg bg-white/70 p-3"
								>
									<dt class="text-xs">Grade {grade.grade}</dt>
									<dd class="mt-1 font-semibold">
										{grade.activeStudents} students · {grade.cohorts} ESL classes
									</dd>
								</div>{/each}
						</dl>
						<div class="grid gap-4 md:grid-cols-2">
							<div>
								<h3 class="text-sm font-semibold">Exceptions</h3>
								{#if readiness.blockers.length}<ul
										class="mt-1 list-disc space-y-1 pl-5 text-sm text-rose-800"
									>
										{#each readiness.blockers as blocker (blocker.kind)}<li>
												{blocker.message}
											</li>{/each}
									</ul>{:else}<p class="mt-1 text-sm">No exceptions.</p>{/if}
							</div>
							<div>
								<h3 class="text-sm font-semibold">Notes</h3>
								{#if readiness.warnings.length}<ul class="mt-1 list-disc space-y-1 pl-5 text-sm">
										{#each readiness.warnings as warning (warning.kind)}<li>
												{warning.message}
											</li>{/each}
									</ul>{:else}<p class="mt-1 text-sm">No additional notes.</p>{/if}
							</div>
						</div>
						{#if readinessError}<p class="text-sm text-rose-800" role="alert">
								{readinessError}
							</p>{/if}
						<Button
							onclick={confirmRoster}
							disabled={confirmingRoster || !readiness.canConfirm}
							testId="esl-admin-students.readiness.confirm"
							>{confirmingRoster ? 'Confirming…' : 'Confirm roster'}</Button
						>
					</div>
				{/if}
			{/if}
		</section>
	{/if}

	<section class="space-y-4" aria-labelledby="esl-student-search-heading">
		<div>
			<h2 id="esl-student-search-heading" class="text-lg font-semibold">Find a student</h2>
			<p class="text-muted-foreground text-sm">
				Search by school ID or name. Student records load only after you search.
			</p>
		</div>
		<form class="flex max-w-xl gap-2" onsubmit={searchStudents}>
			<Label class="sr-only" for="esl-student-search">Search by ID or name</Label>
			<Input
				id="esl-student-search"
				bind:value={searchDraft}
				placeholder="School ID, English name, or Chinese name"
				data-testid="esl-admin-students.search"
			/>
			<Button type="submit">Search</Button>
		</form>
		{#if !searchTerm}
			<p class="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
				Search to load matching students.
			</p>
		{:else if searchQuery.isLoading}
			<p class="text-muted-foreground py-8 text-center text-sm">Searching…</p>
		{:else if searchHits.length === 0}
			<p class="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
				No active student in {selectedYear} matches “{searchTerm}”.
			</p>
		{:else}
			<Table.Root class="rounded-lg border bg-white">
				<Table.Header
					><Table.Row
						><Table.Head class="w-10"
							><span class="sr-only">Select student for transfer</span></Table.Head
						><Table.Head>Student</Table.Head><Table.Head>School ID</Table.Head><Table.Head
							>Grade</Table.Head
						><Table.Head>Chinese class</Table.Head><Table.Head>ESL class</Table.Head><Table.Head
							class="text-right">More</Table.Head
						></Table.Row
					></Table.Header
				>
				<Table.Body>
					{#each searchHits as hit (hit._id)}
						<Table.Row data-testid="esl-admin-students.search-result">
							<Table.Cell
								><input
									type="radio"
									name="transfer-student"
									value={hit._id}
									bind:group={selectedStudentId}
									aria-label="Select {hit.englishName ?? hit.chineseName} for transfer"
								/></Table.Cell
							>
							<Table.Cell class="font-medium"
								>{hit.englishName ?? hit.chineseName}{#if hit.englishName}<span
										class="text-muted-foreground block text-xs">{hit.chineseName}</span
									>{/if}</Table.Cell
							>
							<Table.Cell>{hit.schoolStudentId}</Table.Cell><Table.Cell
								>Grade {hit.grade}</Table.Cell
							><Table.Cell>{hit.homeroom || '—'}</Table.Cell><Table.Cell
								>{hit.cohortLabel}</Table.Cell
							>
							<Table.Cell class="text-right"
								><details class="group relative inline-block">
									<summary
										aria-label="More actions for {hit.englishName ?? hit.chineseName}"
										class="hover:bg-muted flex size-8 cursor-pointer list-none items-center justify-center rounded-md"
										><MoreHorizontal class="size-4" /></summary
									>
									<div
										class="bg-popover absolute right-0 z-20 mt-1 w-48 rounded-lg border p-1 text-left shadow-lg"
									>
										<button
											type="button"
											class="hover:bg-muted w-full rounded px-3 py-2 text-left text-sm"
											onclick={() => openMove('level', hit)}>Move ESL class</button
										><button
											type="button"
											class="hover:bg-muted w-full rounded px-3 py-2 text-left text-sm"
											onclick={() => openMove('homeroom', hit)}>Move Chinese class</button
										>
									</div>
								</details></Table.Cell
							>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</section>

	{#if searchTerm && transferHistory.length > 0}
		<details class="rounded-xl border p-4">
			<summary class="cursor-pointer font-semibold">Recent class moves · {selectedYear}</summary
			><Table.Root class="mt-3"
				><Table.Header
					><Table.Row
						><Table.Head>Student</Table.Head><Table.Head>Move</Table.Head><Table.Head
							>From</Table.Head
						><Table.Head>To</Table.Head><Table.Head>Reason</Table.Head><Table.Head>When</Table.Head
						></Table.Row
					></Table.Header
				><Table.Body
					>{#each transferHistory as row (row._id)}<Table.Row
							><Table.Cell>{row.studentName}</Table.Cell><Table.Cell
								><Badge variant="secondary">{row.kind}</Badge></Table.Cell
							><Table.Cell
								>{row.kind === 'level' ? row.fromCohort : row.fromChineseClass}</Table.Cell
							><Table.Cell>{row.kind === 'level' ? row.toCohort : row.toChineseClass}</Table.Cell
							><Table.Cell>{row.reason ?? '—'}</Table.Cell><Table.Cell
								>{new Date(row.movedAt).toLocaleDateString()}</Table.Cell
							></Table.Row
						>{/each}</Table.Body
				></Table.Root
			>
		</details>
	{/if}

	{#if overview?.confirmed}
		<details class="rounded-xl border p-4">
			<summary class="cursor-pointer font-semibold"
				>Roster history · {selectedYear} confirmed</summary
			>
			<p class="text-muted-foreground mt-2 text-sm">
				{overview.confirmedReason === 'signoff'
					? `Confirmed by ${overview.confirmedBy ?? 'an admin'}${overview.confirmedAt ? ` on ${new Date(overview.confirmedAt).toLocaleDateString()}` : ''}.`
					: 'This year is open because its class schedules already exist.'}
			</p>
		</details>
		<section
			class="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
			aria-label="Roster task completed"
			transition:fly={{ y: 24, duration: 320 }}
		>
			<div class="rounded-full bg-emerald-100 p-2"><Check class="size-5" /></div>
			<div class="min-w-0 flex-1">
				<p class="font-semibold">{selectedYear} roster confirmed</p>
				<p class="text-sm text-emerald-900/75">Enrollment is available for this school year.</p>
			</div>
			<Badge>Complete</Badge>
		</section>
	{/if}
</main>

{#if enrollDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			class="absolute inset-0 size-full bg-black/50"
			type="button"
			aria-label="Close enrollment dialog"
			onclick={() => (enrollDialog = false)}
		></button>
		<div
			class="bg-background relative z-10 w-full max-w-2xl rounded-xl border p-6 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="enroll-title"
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<h2 id="enroll-title" class="text-xl font-semibold">Enroll a student</h2>
					<p class="text-muted-foreground mt-1 text-sm">
						Enter the student ID to determine grade and available classes.
					</p>
				</div>
				<Button
					variant="ghost"
					size="icon"
					onclick={() => (enrollDialog = false)}
					aria-label="Close enrollment"><X class="size-4" /></Button
				>
			</div>
			<form class="mt-5 space-y-4" onsubmit={submitEnrollment}>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-1">
						<Label for="enroll-student-id">Student ID *</Label><Input
							id="enroll-student-id"
							value={schoolStudentId}
							oninput={(event) => updateStudentId(event.currentTarget.value)}
							inputmode="numeric"
							placeholder="e.g. 1150001"
							required
						/>
					</div>
					<div class="space-y-1">
						<Label for="enroll-chinese-name">Chinese name *</Label><Input
							id="enroll-chinese-name"
							bind:value={chineseName}
							placeholder="中文姓名"
							required
						/>
					</div>
					<div class="space-y-1">
						<Label for="enroll-english-name"
							>English name <span class="text-muted-foreground font-normal">Optional</span></Label
						><Input
							id="enroll-english-name"
							bind:value={englishName}
							placeholder="Add when available"
						/>
					</div>
					<div class="space-y-1">
						<span class="block text-sm font-medium">Grade</span>
						<div class="bg-muted/40 flex h-10 items-center rounded-md border px-3 text-sm">
							{#if enrollmentGrade !== null}Grade {enrollmentGrade}{:else if schoolStudentId.trim()}ID
								does not determine a grade in {selectedYear}{:else}Enter student ID first{/if}
						</div>
					</div>
					<div class="space-y-1">
						<Label for="enroll-chinese-class">Chinese class *</Label><NativeSelect.Root
							id="enroll-chinese-class"
							bind:value={chineseClass}
							disabled={enrollmentGrade === null || enrollmentOptionsQuery.isLoading}
							onchange={() => (enrollmentCohortId = '')}
							><NativeSelect.Option value=""
								>{enrollmentGrade === null
									? 'Enter student ID first'
									: 'Select existing class'}</NativeSelect.Option
							>{#each enrollmentOptions?.chineseClasses ?? [] as className (className)}<NativeSelect.Option
									value={className}>{className}</NativeSelect.Option
								>{/each}</NativeSelect.Root
						>
					</div>
					<div class="space-y-1">
						<Label for="enroll-esl-class">ESL class *</Label><NativeSelect.Root
							id="enroll-esl-class"
							bind:value={enrollmentCohortId}
							disabled={!chineseClass}
							><NativeSelect.Option value=""
								>{chineseClass
									? 'Select ESL class'
									: 'Select Chinese class first'}</NativeSelect.Option
							>{#each eligibleEslClasses as cohort (cohort.cohortId)}<NativeSelect.Option
									value={cohort.cohortId}>{cohort.label}</NativeSelect.Option
								>{/each}</NativeSelect.Root
						>{#if chineseClass}<p class="text-muted-foreground text-xs">
								Only ESL classes in the selected Chinese class’s band are shown.
							</p>{/if}
					</div>
				</div>
				{#if enrollmentError}<p
						class="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800"
						role="alert"
					>
						{enrollmentError}
					</p>{/if}
				<div class="flex justify-end gap-2 border-t pt-4">
					<Button variant="outline" type="button" onclick={() => (enrollDialog = false)}
						>Cancel</Button
					><Button
						type="submit"
						disabled={enrolling || enrollmentGrade === null || !chineseClass || !enrollmentCohortId}
						>{enrolling ? 'Enrolling…' : 'Enroll student'}</Button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if transferDialog && selectedStudent}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			class="absolute inset-0 size-full bg-black/50"
			type="button"
			aria-label="Close transfer dialog"
			onclick={closeTransfer}
		></button>
		<div
			class="bg-background relative z-10 w-full max-w-md rounded-xl border p-6 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="transfer-title"
		>
			<div class="flex items-start justify-between">
				<h2 id="transfer-title" class="text-xl font-semibold">Transfer student out</h2>
				<Button variant="ghost" size="icon" onclick={closeTransfer} aria-label="Close transfer"
					><X class="size-4" /></Button
				>
			</div>
			<p class="text-muted-foreground mt-2 text-sm">
				{selectedStudent.englishName ?? selectedStudent.chineseName} · {selectedStudent.schoolStudentId}
			</p>
			<div class="mt-4 space-y-3">
				<div class="space-y-1">
					<Label for="transfer-effective-date">Effective date *</Label><Input
						id="transfer-effective-date"
						type="date"
						bind:value={effectiveDate}
						required
					/>
				</div>
				<div class="space-y-1">
					<Label for="transfer-reason">Reason *</Label><Input
						id="transfer-reason"
						bind:value={transferReason}
						placeholder="Add a free-text reason"
						required
					/>
				</div>
			</div>
			{#if transferError}<p
					class="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800"
					role="alert"
				>
					{transferError}
				</p>{/if}
			<div class="mt-4 flex justify-end gap-2">
				<Button variant="outline" onclick={closeTransfer}>Cancel</Button><Button
					onclick={confirmTransfer}
					disabled={transferring || !transferReason.trim()}
					>{transferring ? 'Saving…' : 'Record transfer'}</Button
				>
			</div>
		</div>
	</div>
{/if}

{#if pendingMove}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			class="absolute inset-0 size-full bg-black/50"
			type="button"
			aria-label="Close move dialog"
			onclick={closeMove}
		></button>
		<div
			class="bg-background relative z-10 w-full max-w-md rounded-xl border p-6 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="move-title"
		>
			<div class="flex items-start justify-between">
				<h2 id="move-title" class="text-xl font-semibold">
					{pendingMove.kind === 'level' ? 'Move ESL class' : 'Move Chinese class'}
				</h2>
				<Button variant="ghost" size="icon" onclick={closeMove} aria-label="Close move dialog"
					><X class="size-4" /></Button
				>
			</div>
			<p class="text-muted-foreground mt-2 text-sm">
				{pendingMove.hit.englishName ?? pendingMove.hit.chineseName} · currently {pendingMove.hit
					.cohortLabel}
			</p>
			{#if pendingMove.kind === 'level'}<div class="mt-4 space-y-1">
					<Label for="move-target-esl">New ESL class</Label><NativeSelect.Root
						id="move-target-esl"
						bind:value={targetCohortId}
						><NativeSelect.Option value="">Select a class</NativeSelect.Option
						>{#each moveTargetCohorts as cohort (cohort._id)}<NativeSelect.Option value={cohort._id}
								>{moveCohortLabel(cohort)}</NativeSelect.Option
							>{/each}</NativeSelect.Root
					>
				</div>{:else}<div class="mt-4 space-y-1">
					<Label for="move-target-chinese">New Chinese class</Label><NativeSelect.Root
						id="move-target-chinese"
						bind:value={newHomeroom}
						><NativeSelect.Option value="">Select a class</NativeSelect.Option
						>{#each homeroomOptions as homeroom (homeroom)}<NativeSelect.Option value={homeroom}
								>{homeroom}</NativeSelect.Option
							>{/each}</NativeSelect.Root
					>
				</div>{/if}
			<div class="mt-4 space-y-1">
				<Label for="move-reason"
					>Reason <span class="text-muted-foreground font-normal">Optional</span></Label
				><Input id="move-reason" bind:value={moveReason} placeholder="Why the student moved" />
			</div>
			{#if moveError}<p
					class="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800"
					role="alert"
				>
					{moveError}
				</p>{/if}
			<div class="mt-4 flex justify-end gap-2">
				<Button variant="outline" onclick={closeMove}>Cancel</Button><Button
					onclick={confirmMove}
					disabled={moveBusy}>{moveBusy ? 'Saving…' : 'Save change'}</Button
				>
			</div>
		</div>
	</div>
{/if}
