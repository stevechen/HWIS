<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import type { FunctionReturnType } from 'convex/server';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$convex/_generated/api';
	import type { Id, Doc } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { UserPlus, UserX, UserCheck, X } from '@lucide/svelte';
	import { chineseClassCode } from '$convex/shared/esl';
	import ImportRoster from '$lib/components/esl/roster/ImportRoster.svelte';
	import { schoolYearOf } from '$lib/components/esl/roster/staging';

	const client = useConvexClient();

	const cohortsQuery = useQuery(api.esl.cohorts.list, () => ({}));

	let selectedCohortId = $state<Id<'esl_cohorts'> | ''>('');
	let includeDisabled = $state(true);
	let studentSearch = $state('');

	const currentSchoolYear = schoolYearOf(new Date());

	// The roster query is skipped until a cohort is chosen: its `cohortId` arg is
	// required, so there is nothing sensible to send before then.
	const studentsQuery = useQuery(api.esl.students.listByCohort, () =>
		selectedCohortId
			? {
					cohortId: selectedCohortId,
					includeDisabled,
					search: studentSearch.trim() || undefined
				}
			: 'skip'
	);

	const cohorts = $derived(cohortsQuery.data ?? []);
	const students = $derived(studentsQuery.data ?? []);
	const activeStudents = $derived(students.filter((s) => s.status === 'active'));

	/**
	 * The year whose roster is on screen.
	 *
	 * The import, the readiness checklist and the roster all have to describe one
	 * year; a page that silently mixed two would let an admin sign off last year's
	 * roster while looking at this year's. The URL can name the year (the Classes
	 * gate links here), and otherwise the newest year with data wins.
	 */
	const dataYears = $derived([...new Set(cohorts.map((cohort) => cohort.year))].sort().reverse());
	const years = $derived(dataYears.length > 0 ? dataYears : [currentSchoolYear]);
	let selectedYear = $state('');
	$effect(() => {
		const fromUrl = untrack(() => page.url.searchParams.get('year'));
		const available = years;
		untrack(() => {
			if (selectedYear !== '' && available.includes(selectedYear)) return;
			selectedYear =
				fromUrl !== null && available.includes(fromUrl)
					? fromUrl
					: (available[0] ?? currentSchoolYear);
		});
	});

	const yearCohorts = $derived(cohorts.filter((cohort) => cohort.year === selectedYear));

	// A class belongs to one year, so a year change must drop a selection that is
	// no longer on screen rather than leave the form aimed at another year's class.
	$effect(() => {
		const visible = yearCohorts;
		untrack(() => {
			if (selectedCohortId !== '' && !visible.some((cohort) => cohort._id === selectedCohortId)) {
				selectedCohortId = '';
			}
		});
	});

	/**
	 * Whether the page was arrived at from the roster link on Classes.
	 *
	 * Read once on mount, the same one-shot pattern the Classes page used when the
	 * importer lived there; `?import=1` and `#import` both open it.
	 */
	let importRequested = $state(false);
	$effect(() => {
		const wanted = untrack(
			() => page.url.hash === '#import' || page.url.searchParams.get('import') === '1'
		);
		importRequested = wanted;
	});

	/** The selected year's roster checklist and sign-off state. */
	const readinessQuery = useQuery(api.esl.yearStatus.readiness, () =>
		selectedYear ? { year: selectedYear } : 'skip'
	);
	const readiness = $derived(
		readinessQuery.data && Array.isArray(readinessQuery.data.blockers) ? readinessQuery.data : null
	);
	let confirmingRoster = $state(false);
	let readinessError = $state('');
	let notice = $state('');

	async function confirmRoster() {
		if (!readiness) return;
		confirmingRoster = true;
		readinessError = '';
		try {
			await client.mutation(api.esl.yearStatus.confirm, { year: readiness.year });
			notice = `Roster confirmed for ${readiness.year}`;
		} catch (error) {
			readinessError =
				error instanceof Error ? error.message : 'Could not confirm the roster for this year';
		} finally {
			confirmingRoster = false;
		}
	}

	async function unconfirmRoster() {
		if (!readiness) return;
		confirmingRoster = true;
		readinessError = '';
		try {
			await client.mutation(api.esl.yearStatus.unconfirm, { year: readiness.year });
			notice = `Roster sign-off withdrawn for ${readiness.year}`;
		} catch (error) {
			readinessError =
				error instanceof Error ? error.message : 'Could not withdraw the roster sign-off';
		} finally {
			confirmingRoster = false;
		}
	}

	/**
	 * A student as the transfer search returns them.
	 *
	 * Taken from the query's own return type so a backend shape change surfaces
	 * here rather than drifting behind a hand-copied type.
	 */
	type TransferHit = FunctionReturnType<typeof api.esl.transfers.search>[number];

	let transferSearch = $state('');
	const transferSearchQuery = useQuery(api.esl.transfers.search, () =>
		selectedYear && transferSearch.trim() !== ''
			? { year: selectedYear, query: transferSearch.trim() }
			: 'skip'
	);
	const transferHits = $derived(transferSearchQuery.data ?? []);

	/** The move being confirmed, if any. */
	let pendingMove = $state<{ kind: 'level' | 'homeroom'; hit: TransferHit } | null>(null);
	let moveReason = $state('');
	let moveError = $state('');
	let moveBusy = $state(false);
	let targetCohortId = $state<Id<'esl_cohorts'> | ''>('');
	let newHomeroom = $state('');

	/** Cohorts in the same band (siblings sharing a Chinese homeroom). */
	const bandCohortsQuery = useQuery(api.esl.bands.bandCohorts, () =>
		pendingMove ? { cohortId: pendingMove.hit.cohortId } : 'skip'
	);

	/** Cohorts from the same band that the student could move into. */
	const moveTargetCohorts = $derived.by(() => {
		const band = bandCohortsQuery.data ?? [];
		if (!pendingMove) return [];
		const move = pendingMove;
		return band.filter(
			(cohort: Doc<'esl_cohorts'>) => cohort.status === 'active' && cohort._id !== move.hit.cohortId
		);
	});

	function openMove(kind: 'level' | 'homeroom', hit: TransferHit) {
		pendingMove = { kind, hit };
		moveReason = '';
		moveError = '';
		targetCohortId = '';
		newHomeroom = hit.homeroom;
	}

	function closeMove() {
		if (moveBusy) return;
		pendingMove = null;
		moveReason = '';
		moveError = '';
		targetCohortId = '';
		newHomeroom = '';
	}

	async function confirmMove() {
		if (pendingMove === null) return;
		moveError = '';
		if (pendingMove.kind === 'level' && targetCohortId === '') {
			moveError = 'Choose the class to move the student into';
			return;
		}
		if (pendingMove.kind === 'homeroom' && newHomeroom.trim() === '') {
			moveError = 'Enter the Chinese homeroom';
			return;
		}

		moveBusy = true;
		try {
			const result =
				pendingMove.kind === 'level'
					? await client.mutation(api.esl.transfers.transferLevel, {
							studentId: pendingMove.hit._id,
							toCohortId: targetCohortId as Id<'esl_cohorts'>,
							...(moveReason.trim() === '' ? {} : { reason: moveReason.trim() })
						})
					: await client.mutation(api.esl.transfers.transferHomeroom, {
							studentId: pendingMove.hit._id,
							chineseClass: newHomeroom.trim(),
							...(moveReason.trim() === '' ? {} : { reason: moveReason.trim() })
						});

			const name = pendingMove.hit.englishName ?? pendingMove.hit.chineseName;
			notice =
				pendingMove.kind === 'level'
					? `${name} moved to ${cohortLabelFor(targetCohortId as Id<'esl_cohorts'>)}`
					: `${name}'s Chinese homeroom changed to ${newHomeroom.trim().toUpperCase()}`;
			if (result.bandChanged) {
				notice += ' — band membership changed, so check the class week.';
			}
			pendingMove = null;
		} catch (error) {
			moveError = error instanceof Error ? error.message : 'Could not move the student';
		} finally {
			moveBusy = false;
		}
	}

	/** The year's recorded moves, newest first. */
	const historyQuery = useQuery(api.esl.transfers.history, () =>
		selectedYear ? { year: selectedYear, limit: 20 } : 'skip'
	);
	const transferHistory = $derived(historyQuery.data ?? []);

	// Manual enrolment
	let englishName = $state('');
	let chineseName = $state('');
	let schoolStudentId = $state('');
	/**
	 * The Chinese homeroom, typed as the school writes it (`J101`).
	 *
	 * Required, because the Communication Slip prints it and a teacher needs it to
	 * reach the right homeroom teacher. Validated against the chosen class's grade
	 * on the server, so the placeholder follows whichever grade is selected.
	 */
	let chineseClass = $state('');
	let enrolling = $state(false);
	let formError = $state('');

	/** Filters the roster by homeroom; empty shows everyone. */
	let chineseClassFilter = $state('');

	/** The chosen class's grade, which decides what a valid homeroom looks like. */
	const selectedGrade = $derived(cohorts.find((c) => c._id === selectedCohortId)?.grade ?? null);

	/**
	 * The homeroom a student is in, as the school writes it.
	 *
	 * Rebuilt from the stored class number and the class's grade, because only the
	 * number is stored (ADR-0025). A student advanced into this year before the
	 * September file arrived has none yet, and reads as unknown rather than as last
	 * year's — a confidently wrong homeroom on a slip is worse than an absent one.
	 */
	function chineseClassLabel(student: { chineseClass?: string }): string {
		if (student.chineseClass === undefined || selectedGrade === null) return '—';
		return chineseClassCode(selectedGrade, student.chineseClass);
	}

	/**
	 * The roster after the homeroom filter.
	 *
	 * A text filter rather than a dropdown of known classes: grades 7–9 draw each
	 * class from three or four different homerooms by design (ADR-0023), so the
	 * distinct values within one roster are most of the grade.
	 */
	const filteredStudents = $derived.by(() => {
		const wanted = chineseClassFilter.trim().toLowerCase();
		if (wanted === '') return students;
		return students.filter((student) => chineseClassLabel(student).toLowerCase().includes(wanted));
	});

	// Transfer status
	let pendingTransfer = $state<{ id: Id<'esl_students'>; name: string } | null>(null);
	let transferReason = $state('');
	let transferring = $state(false);
	let transferError = $state('');

	let busyId = $state<string | null>(null);

	function cohortLabelFor(id: Id<'esl_cohorts'>): string {
		return cohorts.find((c) => c._id === id)?.label ?? 'class';
	}

	async function enrol(event: SubmitEvent) {
		event.preventDefault();
		formError = '';
		notice = '';
		if (!selectedCohortId) {
			formError = 'Choose a class first';
			return;
		}
		enrolling = true;
		try {
			await client.mutation(api.esl.students.create, {
				cohortId: selectedCohortId,
				englishName: englishName.trim(),
				chineseName: chineseName.trim(),
				schoolStudentId: schoolStudentId.trim(),
				chineseClass: chineseClass.trim()
			});
			notice = `Enrolled ${englishName.trim() || chineseName.trim()} into ${cohortLabelFor(selectedCohortId)}`;
			englishName = '';
			chineseName = '';
			schoolStudentId = '';
			chineseClass = '';
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
				Rosters belong to a class. Transfers are recorded in place so a class's history stays
				readable.
			</p>
		</div>
		<div class="flex items-end gap-3">
			<div class="space-y-1">
				<Label for="esl-students-year">Year</Label>
				<NativeSelect.Root
					id="esl-students-year"
					data-testid="esl-admin-students.year"
					bind:value={selectedYear}
				>
					{#each years as year (year)}
						<NativeSelect.Option value={year}>{year}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
			<div class="space-y-1">
				<Label for="esl-students-class">Class</Label>
				<NativeSelect.Root
					id="esl-students-class"
					data-testid="esl-admin-students.class"
					bind:value={selectedCohortId}
				>
					<NativeSelect.Option value="">Select a class…</NativeSelect.Option>
					{#each yearCohorts as cohort (cohort._id)}
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
			<div class="space-y-1">
				<Label for="esl-students-search">Find a student</Label>
				<Input
					id="esl-students-search"
					data-testid="esl-admin-students.search"
					bind:value={studentSearch}
					placeholder="Search by name or ID..."
				/>
			</div>
			<div class="space-y-1">
				<Label for="esl-students-chinese-class-filter">Chinese class</Label>
				<Input
					id="esl-students-chinese-class-filter"
					data-testid="esl-admin-students.chinese-class-filter"
					bind:value={chineseClassFilter}
					placeholder="Filter by homeroom, e.g. J101"
					class="w-44"
				/>
			</div>
		</div>
		<ImportRoster expanded={importRequested} initialYear={selectedYear || currentSchoolYear} />
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
			<div class="space-y-1">
				<Label for="esl-student-chinese-class">Chinese class</Label>
				<Input
					id="esl-student-chinese-class"
					data-testid="esl-admin-students.form.chineseClass"
					bind:value={chineseClass}
					placeholder={selectedGrade === null ? 'J101' : chineseClassCode(selectedGrade, '01')}
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
						Choose a class first — a roster belongs to one.
					</p>
				{:else if formError}
					<p data-testid="esl-admin-students.form.error" class="text-sm text-red-700">
						{formError}
					</p>
				{/if}
			</div>
		</form>
	</section>

	<!--
		The roster checklist. The sign-off lives here because the roster does: an
		admin imports or corrects the year's students on this page, then confirms
		the year is complete. Classes renders its own copy of the checklist behind
		the gate, so the two pages cannot disagree about what is missing.
	-->
	<section
		aria-labelledby="esl-admin-students-readiness-heading"
		class="rounded-lg border bg-white p-6 shadow-sm"
		data-testid="esl-admin-students.readiness"
	>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 id="esl-admin-students-readiness-heading" class="text-lg font-semibold">
					Roster readiness — {selectedYear || 'no year'}
				</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Classes stays locked until an admin confirms this year's roster is complete.
				</p>
			</div>
			{#if readiness}
				{#if readiness.confirmedReason === 'signoff'}
					<div class="flex items-center gap-3">
						<Badge data-testid="esl-admin-students.readiness.confirmed">Confirmed</Badge>
						<span class="text-muted-foreground text-xs">
							{readiness.confirmedBy ?? 'an admin'} · {readiness.confirmedAt
								? new Date(readiness.confirmedAt).toLocaleString()
								: ''}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={confirmingRoster}
							onclick={unconfirmRoster}
							testId="esl-admin-students.readiness.unconfirm"
						>
							Withdraw
						</Button>
					</div>
				{:else if readiness.confirmedReason === 'existing-meetings'}
					<div class="flex items-center gap-3">
						<Badge variant="secondary">Open because schedules exist</Badge>
						<Button
							variant="outline"
							size="sm"
							disabled={confirmingRoster || !readiness.canConfirm}
							onclick={confirmRoster}
							testId="esl-admin-students.readiness.confirm"
						>
							Sign off anyway
						</Button>
					</div>
				{:else}
					<Button
						size="sm"
						disabled={confirmingRoster || !readiness.canConfirm}
						onclick={confirmRoster}
						testId="esl-admin-students.readiness.confirm"
					>
						{confirmingRoster ? 'Confirming…' : 'The roster is complete'}
					</Button>
				{/if}
			{/if}
		</div>

		{#if readiness}
			<div class="mt-4 grid gap-4 md:grid-cols-2">
				<div>
					<h3 class="text-sm font-medium text-red-800">Blockers</h3>
					{#if readiness.blockers.length === 0}
						<p
							class="text-muted-foreground mt-1 text-sm"
							data-testid="esl-admin-students.readiness.blockers"
						>
							None.
						</p>
					{:else}
						<ul
							class="mt-1 list-disc space-y-1 pl-5 text-sm text-red-800"
							data-testid="esl-admin-students.readiness.blockers"
						>
							{#each readiness.blockers as blocker (blocker.kind)}
								<li>{blocker.message}</li>
							{/each}
						</ul>
					{/if}
				</div>
				<div>
					<h3 class="text-sm font-medium">Warnings</h3>
					{#if readiness.warnings.length === 0}
						<p class="text-muted-foreground mt-1 text-sm">None.</p>
					{:else}
						<ul class="text-muted-foreground mt-1 list-disc space-y-1 pl-5 text-sm">
							{#each readiness.warnings as warning (warning.kind)}
								<li>{warning.message}</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
			<dl
				class="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"
				data-testid="esl-admin-students.readiness.grades"
			>
				{#each readiness.grades as grade (grade.grade)}
					<div class="rounded border p-2">
						<dt class="text-muted-foreground">G{grade.grade}</dt>
						<dd>{grade.cohorts} cohorts · {grade.activeStudents} students</dd>
						{#if grade.missingHomerooms > 0}
							<dd class="text-red-700">{grade.missingHomerooms} missing homerooms</dd>
						{/if}
						{#if grade.duplicateIds > 0}
							<dd class="text-red-700">{grade.duplicateIds} duplicate IDs</dd>
						{/if}
					</div>
				{/each}
			</dl>
		{:else if readinessQuery.isLoading}
			<p class="text-muted-foreground mt-3 text-sm">Loading readiness…</p>
		{/if}

		{#if readinessError}
			<p class="mt-3 text-sm text-red-700" data-testid="esl-admin-students.readiness.error">
				{readinessError}
			</p>
		{/if}
	</section>

	<section
		aria-labelledby="esl-admin-students-move-heading"
		class="rounded-lg border bg-white p-6 shadow-sm"
		data-testid="esl-admin-students.move"
	>
		<h2 id="esl-admin-students-move-heading" class="text-lg font-semibold">Transfer a student</h2>
		<p class="text-muted-foreground mt-1 text-sm">
			Search the selected year by school ID, English or Chinese name, Chinese class or ESL class,
			then move the student to another level or correct their Chinese homeroom.
		</p>
		<div class="mt-4 max-w-md space-y-1">
			<Label for="esl-students-transfer-search">Find a student</Label>
			<Input
				id="esl-students-transfer-search"
				data-testid="esl-admin-students.move.search"
				bind:value={transferSearch}
				placeholder="7001001, Alice, 陳小美, J101, G7 Basic 1…"
			/>
		</div>

		{#if transferSearch.trim() !== ''}
			{#if transferSearchQuery.isLoading}
				<p class="text-muted-foreground mt-4 text-sm">Searching…</p>
			{:else if transferHits.length === 0}
				<p class="text-muted-foreground mt-4 text-sm" data-testid="esl-admin-students.move.empty">
					No active student in {selectedYear} matches “{transferSearch.trim()}”.
				</p>
			{:else}
				<Table.Root class="mt-4 rounded-lg border">
					<Table.Header>
						<Table.Row>
							<Table.Head>Student</Table.Head>
							<Table.Head>School ID</Table.Head>
							<Table.Head>Chinese class</Table.Head>
							<Table.Head>ESL class</Table.Head>
							<Table.Head class="text-right">Move</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each transferHits as hit (hit._id)}
							<Table.Row data-testid="esl-admin-students.move.result">
								<Table.Cell class="font-medium">
									{hit.englishName ?? hit.chineseName}
									{#if hit.englishName}
										<span class="text-muted-foreground block text-xs">{hit.chineseName}</span>
									{/if}
								</Table.Cell>
								<Table.Cell>{hit.schoolStudentId}</Table.Cell>
								<Table.Cell>{hit.homeroom || '—'}</Table.Cell>
								<Table.Cell>{hit.cohortLabel}</Table.Cell>
								<Table.Cell class="space-x-2 text-right">
									<Button
										variant="outline"
										size="sm"
										onclick={() => openMove('level', hit)}
										testId="esl-admin-students.move.level"
									>
										Move level
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={() => openMove('homeroom', hit)}
										testId="esl-admin-students.move.homeroom"
									>
										Change homeroom
									</Button>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		{/if}
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
				data-testid="esl-admin-students.no-class"
			>
				Choose a class to see its roster.
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
				This class has no students yet.
			</p>
		{:else if filteredStudents.length === 0}
			<p
				class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
				data-testid="esl-admin-students.filtered-empty"
			>
				No student in this class is in {chineseClassFilter.trim()}.
			</p>
		{:else}
			<Table.Root class="rounded-lg border bg-white">
				<Table.Header>
					<Table.Row>
						<Table.Head>English name</Table.Head>
						<Table.Head>Chinese name</Table.Head>
						<Table.Head>Chinese class</Table.Head>
						<Table.Head>School student ID</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Reason</Table.Head>
						<Table.Head class="text-right">Transfer</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filteredStudents as student (student._id)}
						<Table.Row data-testid="esl-admin-students.row">
							<Table.Cell class="font-medium">{studentName(student)}</Table.Cell>
							<Table.Cell>{student.chineseName}</Table.Cell>
							<Table.Cell data-testid="esl-admin-students.row-chinese-class">
								{chineseClassLabel(student)}
							</Table.Cell>
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

	<section
		aria-labelledby="esl-admin-students-history-heading"
		class="space-y-3"
		data-testid="esl-admin-students.history"
	>
		<h2 id="esl-admin-students-history-heading" class="text-lg font-semibold">
			Recent transfers
			<span class="text-muted-foreground font-normal">({selectedYear || 'no year'})</span>
		</h2>
		{#if transferHistory.length === 0}
			<p class="text-muted-foreground text-sm">No level or homeroom moves recorded this year.</p>
		{:else}
			<Table.Root class="rounded-lg border bg-white">
				<Table.Header>
					<Table.Row>
						<Table.Head>Student</Table.Head>
						<Table.Head>Move</Table.Head>
						<Table.Head>From</Table.Head>
						<Table.Head>To</Table.Head>
						<Table.Head>Reason</Table.Head>
						<Table.Head>By</Table.Head>
						<Table.Head>When</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each transferHistory as row (row._id)}
						<Table.Row data-testid="esl-admin-students.history.row">
							<Table.Cell class="font-medium">
								{row.studentName}
								<span class="text-muted-foreground block text-xs">{row.schoolStudentId}</span>
							</Table.Cell>
							<Table.Cell>
								<Badge variant="secondary">{row.kind}</Badge>
							</Table.Cell>
							<Table.Cell>{row.kind === 'level' ? row.fromCohort : row.fromChineseClass}</Table.Cell
							>
							<Table.Cell>{row.kind === 'level' ? row.toCohort : row.toChineseClass}</Table.Cell>
							<Table.Cell class="text-muted-foreground">{row.reason ?? '—'}</Table.Cell>
							<Table.Cell>{row.movedBy}</Table.Cell>
							<Table.Cell class="text-muted-foreground">
								{new Date(row.movedAt).toLocaleString()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</section>
</div>

{#if pendingMove}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
		aria-labelledby="esl-admin-students-move-title"
		data-testid="esl-admin-students.move-dialog"
	>
		<div class="bg-background w-full max-w-md rounded-lg p-6 shadow-lg">
			<div class="flex items-start justify-between">
				<h2 id="esl-admin-students-move-title" class="text-xl font-semibold">
					{pendingMove.kind === 'level' ? 'Move to another level' : 'Change Chinese homeroom'}
				</h2>
				<Button
					variant="ghost"
					size="icon"
					onclick={closeMove}
					aria-label="Cancel move"
					testId="esl-admin-students.move-dialog.cancel"
				>
					<X class="size-4" />
				</Button>
			</div>
			<p class="text-muted-foreground mt-2 text-sm">
				<span class="font-medium">
					{pendingMove.hit.englishName ?? pendingMove.hit.chineseName}
				</span>
				· {pendingMove.hit.schoolStudentId} · currently {pendingMove.hit.cohortLabel}
				{#if pendingMove.kind === 'homeroom'}
					· homeroom {pendingMove.hit.homeroom || 'not set'}
				{/if}
			</p>

			{#if pendingMove.kind === 'level'}
				<label class="mt-4 block text-sm font-medium" for="esl-move-target">Move to</label>
				<NativeSelect.Root
					id="esl-move-target"
					data-testid="esl-admin-students.move-dialog.target"
					bind:value={targetCohortId}
				>
					<NativeSelect.Option value="">Choose a class…</NativeSelect.Option>
					{#each moveTargetCohorts as cohort (cohort._id)}
						<NativeSelect.Option value={cohort._id}
							>{cohortLabelFor(cohort._id)}</NativeSelect.Option
						>
					{/each}
				</NativeSelect.Root>
			{:else}
				<label class="mt-4 block text-sm font-medium" for="esl-move-homeroom">
					Chinese homeroom
				</label>
				<NativeSelect.Root
					id="esl-move-homeroom"
					data-testid="esl-admin-students.move-dialog.homeroom"
					bind:value={newHomeroom}
				>
					{#if pendingMove}
						{#each Array.from({ length: 11 }, (_, i) => String(i + 1).padStart(2, '0')) as code}
							<NativeSelect.Option value={chineseClassCode(pendingMove.hit.grade, code)}>
								{chineseClassCode(pendingMove.hit.grade, code)}
							</NativeSelect.Option>
						{/each}
					{/if}
				</NativeSelect.Root>
			{/if}

			<label class="mt-4 block text-sm font-medium" for="esl-move-reason">Reason (optional)</label>
			<Input
				id="esl-move-reason"
				data-testid="esl-admin-students.move-dialog.reason"
				bind:value={moveReason}
				placeholder="Why the student moved"
			/>

			{#if moveError}
				<p
					data-testid="esl-admin-students.move-dialog.error"
					class="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
				>
					{moveError}
				</p>
			{/if}

			<div class="mt-4 flex justify-end gap-2">
				<Button
					variant="outline"
					onclick={closeMove}
					testId="esl-admin-students.move-dialog.dismiss">Cancel</Button
				>
				<Button
					onclick={confirmMove}
					disabled={moveBusy}
					testId="esl-admin-students.move-dialog.confirm"
				>
					{moveBusy ? 'Moving…' : pendingMove.kind === 'level' ? 'Move student' : 'Save homeroom'}
				</Button>
			</div>
		</div>
	</div>
{/if}

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
				<span class="font-medium">{pendingTransfer.name}</span> stays in this class's history, marked
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
