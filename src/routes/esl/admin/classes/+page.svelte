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
	import { Plus, RefreshCw } from '@lucide/svelte';
	import {
		ESL_CLASS_NUMBERS,
		ESL_GRADE10_MAX_CLASS_NUMBER,
		ESL_GRADES,
		ESL_LEVELS,
		ESL_GRADE10_LEVELS,
		classTypeLabel,
		classTypesForCohort,
		grade10BaseClass,
		defaultClassName,
		isLevelledGrade,
		isSharedRosterGrade,
		isValidGrade10ClassNumber,
		type EslGrade10Level
	} from '$convex/shared/esl';

	const client = useConvexClient();

	/** The current school year, e.g. `2025-2026`. */
	function currentSchoolYear(): string {
		const now = new Date();
		const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
		return `${start}-${start + 1}`;
	}

	const cohortsQuery = useQuery(api.esl.cohorts.list, () => ({}));
	const staffQuery = useQuery(api.esl.staff.listAssignable, () => ({}));

	const cohorts = $derived(cohortsQuery.data ?? []);
	const assignable = $derived(staffQuery.data ?? []);

	let yearFilter = $state('');
	let gradeFilter = $state('');

	// Creation form. Grade 10 has no level, and its base classes are typed in
	// rather than picked: the school runs a different number each year, so a
	// fixed dropdown would either lie about what exists or block a new year.
	let newYear = $state(currentSchoolYear());
	let newGrade = $state<number>(7);
	let newLevel = $state<string>('Basic');
	// Grade 10 is levelled too, but by A/B rather than by name, and its level is
	// part of the cohort's identity — one Chinese class at one level is one
	// cohort with one roster (ADR-0023).
	let newGrade10Level = $state<EslGrade10Level>('A');
	// The levelled grades pick from a fixed list (a select binds a string);
	// grade 10 types a base class (a number input binds a number). Both are
	// read through `newClassNumberText`.
	let newClassNumber = $state<string | number>('1');
	let creating = $state(false);
	let createError = $state('');
	let notice = $state('');

	const levelled = $derived(isLevelledGrade(newGrade));

	// A number input binds a number and a cleared one binds undefined, so
	// normalise to text before validating or formatting.
	const newClassNumberText = $derived(
		newClassNumber === undefined || newClassNumber === null ? '' : String(newClassNumber)
	);

	// The levelled grades run a fixed 1–2; grade 10's base class is any number
	// within the name-format bound.
	const levelledNumbers = ESL_CLASS_NUMBERS;
	const grade10NumberValid = $derived(levelled || isValidGrade10ClassNumber(newClassNumberText));

	// Switching to or from grade 10 moves between incompatible class-number
	// formats, so an entry that cannot be a grade 10 base class at all is reset.
	// A number that is simply out of range is left alone so the admin sees
	// their own input (and the disabled submit) rather than a silent swap.
	$effect(() => {
		if (levelled && !levelledNumbers.includes(newClassNumberText as never)) {
			newClassNumber = levelledNumbers[0] as string;
		}
		if (!levelled && !/^\d+$/.test(newClassNumberText)) {
			// Empty or non-numeric cannot become a base class; reset to 1.
			newClassNumber = 1;
		}
	});

	/** A short human summary of the cohort being created, for the success line. */
	const cohortSummary = $derived(
		levelled
			? `G${newGrade} ${newLevel} ${newClassNumberText}`
			: `G${newGrade} H1${grade10BaseClass(newClassNumberText || '0')}`
	);

	// Per-action state, keyed by row id so one failure never blocks the rest.
	let busyId = $state<string | null>(null);
	let rowError = $state('');

	const visibleCohorts = $derived(
		cohorts.filter(
			(cohort) =>
				(!yearFilter || cohort.year === yearFilter) &&
				(!gradeFilter || cohort.grade === Number(gradeFilter))
		)
	);

	const years = $derived([...new Set(cohorts.map((c) => c.year))].sort().reverse());

	function run(action: () => Promise<unknown>, id: string, message: string) {
		busyId = id;
		rowError = '';
		action()
			.then(() => {
				notice = message;
			})
			.catch((error: unknown) => {
				rowError = error instanceof Error ? error.message : 'Something went wrong';
			})
			.finally(() => {
				busyId = null;
			});
	}

	async function createCohort(event: SubmitEvent) {
		event.preventDefault();
		createError = '';
		notice = '';
		creating = true;
		try {
			await client.mutation(api.esl.cohorts.create, {
				year: newYear.trim(),
				grade: newGrade,
				// Grade 10's level is A or B, and it identifies the cohort just as the
				// levelled grades' level name does (ADR-0023).
				...(levelled ? { level: newLevel } : { level: newGrade10Level }),
				// Grade 10's base class is typed, so it is normalised to text first
				// (a number input binds a number).
				classNumber: newClassNumberText
			});
			notice = `Created ${cohortSummary} for ${newYear.trim()}`;
		} catch (error) {
			createError = error instanceof Error ? error.message : 'Could not create the class';
		} finally {
			creating = false;
		}
	}

	/**
	 * Assigns (or clears) the class teacher. The select's value is the teacher
	 * id, or `''` for "unassigned", which the mutation models as an absent id.
	 */
	function assignTeacher(classId: Id<'esl_classes'>, teacherId: string) {
		run(
			() =>
				client.mutation(api.esl.classes.assignTeacher, {
					id: classId,
					teacherId: teacherId ? (teacherId as Id<'users'>) : undefined
				}),
			classId,
			teacherId ? 'Class teacher assigned' : 'Class teacher cleared'
		);
	}

	function archiveCohort(cohortId: Id<'esl_cohorts'>, label: string) {
		run(
			() => client.mutation(api.esl.cohorts.update, { id: cohortId, status: 'archived' }),
			cohortId,
			`Archived ${label}`
		);
	}

	function restoreCohort(cohortId: Id<'esl_cohorts'>, label: string) {
		run(
			() => client.mutation(api.esl.cohorts.update, { id: cohortId, status: 'active' }),
			cohortId,
			`Restored ${label}`
		);
	}
</script>

<div class="mx-auto w-full max-w-6xl space-y-8 p-8">
	<header>
		<h1 data-testid="esl-admin-classes.title" class="text-2xl font-bold text-emerald-900">
			Classes
		</h1>
	</header>

	<section
		aria-labelledby="esl-admin-classes-create-heading"
		class="rounded-lg border bg-white p-6 shadow-sm"
		data-testid="esl-admin-classes.create"
	>
		<h2 id="esl-admin-classes-create-heading" class="text-lg font-semibold">New class</h2>
		<form class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onsubmit={createCohort}>
			<div class="space-y-1">
				<Label for="esl-class-year">School year</Label>
				<Input
					id="esl-class-year"
					data-testid="esl-admin-classes.form.year"
					bind:value={newYear}
					placeholder="2025-2026"
					required
				/>
			</div>
			<div class="space-y-1">
				<Label for="esl-class-grade">Grade</Label>
				<NativeSelect.Root
					id="esl-class-grade"
					data-testid="esl-admin-classes.form.grade"
					bind:value={newGrade}
				>
					{#each ESL_GRADES as grade (grade)}
						<NativeSelect.Option value={grade}>G{grade}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
			{#if levelled}
				<div class="space-y-1">
					<Label for="esl-class-level">Level</Label>
					<NativeSelect.Root
						id="esl-class-level"
						data-testid="esl-admin-classes.form.level"
						bind:value={newLevel}
					>
						{#each ESL_LEVELS as level (level)}
							<NativeSelect.Option value={level}>{level}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</div>
			{:else}
				<!--
					Grade 10 is levelled too, but by A/B rather than by name, and the level is
					part of the cohort: one Chinese class at one level is one cohort with its
					 own roster, so H101A and H101B are two cohorts (ADR-0023).
				-->
				<div class="space-y-1">
					<Label for="esl-class-level10">Level</Label>
					<NativeSelect.Root
						id="esl-class-level10"
						data-testid="esl-admin-classes.form.level"
						bind:value={newGrade10Level}
					>
						{#each ESL_GRADE10_LEVELS as level (level)}
							<NativeSelect.Option value={level}>{level}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</div>
			{/if}
			<div class="space-y-1">
				<Label for="esl-class-number">
					{levelled ? 'Class number' : 'Chinese class'}
				</Label>
				{#if levelled}
					<NativeSelect.Root
						id="esl-class-number"
						data-testid="esl-admin-classes.form.classNumber"
						bind:value={newClassNumber}
					>
						{#each levelledNumbers as number (number)}
							<NativeSelect.Option value={number}>{number}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				{:else}
					<Input
						id="esl-class-number"
						data-testid="esl-admin-classes.form.classNumber"
						type="number"
						min="1"
						max={ESL_GRADE10_MAX_CLASS_NUMBER}
						inputmode="numeric"
						aria-describedby="esl-class-number-hint"
						bind:value={newClassNumber}
					/>
					<p
						id="esl-class-number-hint"
						data-testid="esl-admin-classes.form.classNumberHint"
						class="text-muted-foreground text-xs"
					>
						1–{ESL_GRADE10_MAX_CLASS_NUMBER}. How many Chinese classes the school runs varies by
						year, so this is typed in rather than chosen from a fixed list.
					</p>
				{/if}
			</div>
			<div class="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
				<Button
					type="submit"
					disabled={creating || !grade10NumberValid}
					testId="esl-admin-classes.form.submit"
				>
					<Plus class="size-4" />
					{creating ? 'Creating…' : 'Create class'}
				</Button>
				<p data-testid="esl-admin-classes.form.preview" class="text-muted-foreground text-sm">
					Creates {classTypesForCohort({
						grade: newGrade,
						level: levelled ? newLevel : newGrade10Level
					})
						.map((type) =>
							defaultClassName(
								{
									year: newYear,
									grade: newGrade,
									level: levelled ? newLevel : newGrade10Level,
									classNumber: newClassNumberText
								},
								type
							)
						)
						.join(' + ')}
					{isSharedRosterGrade(newGrade) ? 'sharing one roster' : 'with its own roster'}.
				</p>
			</div>
		</form>
		{#if createError}
			<p
				data-testid="esl-admin-classes.form.error"
				class="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
			>
				{createError}
			</p>
		{/if}
		{#if notice}
			<p
				data-testid="esl-admin-classes.form.notice"
				class="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
			>
				{notice}
			</p>
		{/if}
	</section>

	<section aria-labelledby="esl-admin-classes-list-heading" class="space-y-4">
		<div class="flex flex-wrap items-end justify-between gap-4">
			<h2 id="esl-admin-classes-list-heading" class="text-lg font-semibold">
				Classes
				<span data-testid="esl-admin-classes.count" class="text-muted-foreground font-normal">
					({visibleCohorts.length})
				</span>
			</h2>
			<div class="flex gap-3">
				<div class="space-y-1">
					<Label for="esl-classes-filter-year">Filter by year</Label>
					<NativeSelect.Root
						id="esl-classes-filter-year"
						data-testid="esl-admin-classes.filter.year"
						bind:value={yearFilter}
					>
						<NativeSelect.Option value="">All years</NativeSelect.Option>
						{#each years as year (year)}
							<NativeSelect.Option value={year}>{year}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</div>
				<div class="space-y-1">
					<Label for="esl-classes-filter-grade">Filter by grade</Label>
					<NativeSelect.Root
						id="esl-classes-filter-grade"
						data-testid="esl-admin-classes.filter.grade"
						bind:value={gradeFilter}
					>
						<NativeSelect.Option value="">All grades</NativeSelect.Option>
						{#each ESL_GRADES as grade (grade)}
							<NativeSelect.Option value={String(grade)}>G{grade}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</div>
			</div>
		</div>

		{#if rowError}
			<p
				data-testid="esl-admin-classes.error"
				class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
			>
				{rowError}
			</p>
		{/if}
		{#if notice}
			<p
				data-testid="esl-admin-classes.notice"
				class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
			>
				{notice}
			</p>
		{/if}

		{#if cohortsQuery.isLoading}
			<p class="text-muted-foreground py-8 text-center" data-testid="esl-admin-classes.loading">
				Loading classes…
			</p>
		{:else if visibleCohorts.length === 0}
			<p
				class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
				data-testid="esl-admin-classes.empty"
			>
				No classes yet. Create the first one above.
			</p>
		{:else}
			<div class="space-y-4">
				{#each visibleCohorts as cohort (cohort._id)}
					{@const key = cohort.code}
					<article
						data-testid={`esl-admin-classes.cohort.${key}`}
						class="rounded-lg border bg-white p-5 shadow-sm"
					>
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="flex items-center gap-3">
								<h3 class="text-base font-semibold text-emerald-900">{cohort.label}</h3>
								<Badge variant={cohort.status === 'active' ? 'default' : 'secondary'}>
									{cohort.status}
								</Badge>
							</div>
							<div class="flex gap-2">
								{#if cohort.status === 'active'}
									<Button
										variant="outline"
										size="sm"
										disabled={busyId === cohort._id}
										onclick={() => archiveCohort(cohort._id, cohort.label)}
										testId={`esl-admin-classes.archive.${key}`}
									>
										Archive
									</Button>
								{:else}
									<Button
										variant="outline"
										size="sm"
										disabled={busyId === cohort._id}
										onclick={() => restoreCohort(cohort._id, cohort.label)}
										testId={`esl-admin-classes.restore.${key}`}
									>
										<RefreshCw class="size-4" />
										Restore
									</Button>
								{/if}
							</div>
						</div>

						<Table.Root class="mt-4">
							<Table.Header>
								<Table.Row>
									<Table.Head>Class</Table.Head>
									<Table.Head>Type</Table.Head>
									<Table.Head>Status</Table.Head>
									<Table.Head>Class teacher</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each cohort.classes as cls (cls._id)}
									<Table.Row data-testid={`esl-admin-classes.class.${cls.type}`}>
										<Table.Cell class="font-medium">{cls.name}</Table.Cell>
										<Table.Cell>{classTypeLabel(cls.type)}</Table.Cell>
										<Table.Cell>{cls.status}</Table.Cell>
										<Table.Cell>
											<NativeSelect.Root
												aria-label="Class teacher for {cls.name}"
												data-testid={`esl-admin-classes.teacher.${cls.type}`}
												value={cls.teacherId ?? ''}
												disabled={busyId === cls._id}
												onchange={(event) => assignTeacher(cls._id, event.currentTarget.value)}
											>
												<NativeSelect.Option value="">Unassigned</NativeSelect.Option>
												{#each assignable as staff (staff._id)}
													<NativeSelect.Option value={staff._id}>
														{staff.name}
													</NativeSelect.Option>
												{/each}
											</NativeSelect.Root>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>
