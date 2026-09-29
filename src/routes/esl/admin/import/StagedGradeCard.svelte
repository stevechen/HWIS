<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import {
		cohortOfGroup,
		isGrade10Group,
		planRosterImport,
		rosterGroupText,
		type RequestedCohort
	} from '$convex/shared/esl_import';
	import { cohortLabel } from '$convex/shared/esl';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { AlertTriangle, Check } from '@lucide/svelte';
	import type { ImportedGrade, StagedGrade } from './staging';

	let {
		year,
		draft,
		onApplied
	}: { year: string; draft: StagedGrade; onApplied: (result: ImportedGrade) => void } = $props();

	const client = useConvexClient();

	// The roster this file will be applied to. The same snapshot the server will
	// read, so the plan below is the plan that will run.
	const snapshot = useQuery(api.esl.import.rosterSnapshot, () => ({ year, grade: draft.grade }));

	/**
	 * Name changes the admin has ticked.
	 *
	 * Empty until ticked, and never ticked by default: a differing name may be a
	 * student's genuine request or a typo in the spreadsheet, and only the admin
	 * can tell which. The server intersects this list with its own, so a name
	 * cannot change without having been shown here.
	 */
	let approved = $state<Id<'esl_students'>[]>([]);
	let applying = $state(false);
	let error = $state('');

	const cohorts = $derived(snapshot.data?.cohorts ?? []);
	const students = $derived(snapshot.data?.students ?? []);
	// Until the roster arrives, every student would plan as new — a preview that
	// says the wrong thing while loading is worse than one that says nothing.
	const loading = $derived(snapshot.isLoading === true);

	const plan = $derived(
		loading ? null : planRosterImport(requestedOf(draft), draft.students, cohorts, students)
	);

	/** The cohorts this file asks for, listed once each. */
	function requestedOf(draft: StagedGrade): RequestedCohort[] {
		const requested: RequestedCohort[] = [];
		for (const student of draft.students) {
			// A file names one cohort per group, so a grade of 500 students asks for
			// about 20. Scanning the short list is not worth a set's ceremony.
			// Grade 10's two sections resolve to one cohort, so a base class is
			// listed once however many sections its sheet carries.
			const request = cohortOfGroup(student.group);
			const already = requested.some(
				(c) =>
					c.grade === request.grade &&
					c.level === request.level &&
					c.classNumber === request.classNumber
			);
			if (!already) requested.push(request);
		}
		return requested;
	}

	/**
	 * A cohort key as the admin reads it, e.g. `G9 Advanced 1` or `G10 H101`.
	 *
	 * Built from the shared label helper rather than from the key's own parts, so
	 * a grade 10 base class reads the way the school names it.
	 */
	function cohortLabelOf(key: string): string {
		const [grade, level, classNumber] = key.split(':');
		const parsedGrade = Number(grade);
		return cohortLabel({
			year,
			grade: parsedGrade,
			...(level ? { level } : {}),
			classNumber: classNumber ?? ''
		});
	}

	/**
	 * The classes this file fills, each with its own student count.
	 *
	 * Grade 10 needs the split because a base class is taught twice, as two sections
	 * of the same cohort. Listed as one row the admin reads 45 students behind
	 * `H101A` and `H101B` as a single class of 45 that does not exist; listed as two
	 * rows they read as what they are — two classes, one roster — so the section
	 * letter goes on the label and the count is the section's own.
	 *
	 * The levelled grades have no sections, so their rows carry an empty one and
	 * read exactly as before.
	 */
	const classesByCohort = $derived.by(() => {
		// A plain list rather than a Map: a file asks for about 20 cohorts, and
		// the accumulator is local to this derivation, so there is nothing to
		// gain from a reactive collection here.
		const rows: { key: string; section: string; count: number }[] = [];
		for (const student of draft.students) {
			const request = cohortOfGroup(student.group);
			const cohortKey = `${request.grade}:${request.level ?? ''}:${request.classNumber}`;
			const section = isGrade10Group(student.group) ? student.group.section : undefined;
			const key = `${cohortKey}:${section ?? ''}`;
			const existing = rows.find((row) => row.key === key);
			if (existing === undefined) {
				rows.push({ key, section: section ?? '', count: 1 });
				continue;
			}
			existing.count += 1;
		}
		// Sorted by cohort, then A before B, so the list reads in the order the
		// school names them rather than the order the sheets happened to arrive in.
		return rows.sort((a, b) => a.key.localeCompare(b.key));
	});

	/** The renames in the plan, or none while it is still loading.
	 *
	 * `plan` is null until the roster arrives, and a preview that guesses would be
	 * worse than one that waits.
	 */
	const nameChanges = $derived(plan?.changes.filter((c) => c.kind === 'nameChange') ?? []);
	const blocked = $derived(
		draft.students.length === 0 ||
			(plan !== null && (plan.duplicateIds.length > 0 || plan.ambiguousIds.length > 0))
	);

	/**
	 * The planner's student IDs are the IDs it was handed in the roster snapshot,
	 * which the server issued, so they are document IDs. The cast keeps the shared
	 * planner free of Convex types.
	 */
	function asStudentId(id: string): Id<'esl_students'> {
		return id as Id<'esl_students'>;
	}

	function toggleRename(studentId: Id<'esl_students'>) {
		approved = approved.includes(studentId)
			? approved.filter((id) => id !== studentId)
			: [...approved, studentId];
	}

	/**
	 * The rows the server is asked to import: the cell text as the sheet held it,
	 * which is what it re-reads rather than trusting.
	 *
	 * The `ESL Group` cell is rebuilt in the canonical spelling the workbook uses.
	 * A misfiled row is filed by its column, so a student whose group text disagrees
	 * with the sheet it sits in is sent with that row's own group — which is the
	 * point of reading the column rather than the sheet name.
	 */
	function rowsToSend() {
		return draft.students.map((student) => ({
			schoolStudentId: student.schoolStudentId,
			chineseName: student.chineseName,
			...(student.englishName === undefined ? {} : { englishName: student.englishName }),
			group: rosterGroupText(student.group)
		}));
	}

	/**
	 * The tag an end-to-end run passes on the URL, so the cohorts and students an
	 * import writes can be removed afterwards by tag.
	 *
	 * Read from the query string rather than stored anywhere server-side, so it is
	 * present only when a test asks for it and absent from every real visit.
	 */
	function e2eTagFromUrl(): string | undefined {
		if (typeof window === 'undefined') return undefined;
		return new URLSearchParams(window.location.search).get('e2eTag') ?? undefined;
	}

	async function apply() {
		error = '';
		applying = true;
		try {
			const result = await client.mutation(api.esl.import.applyRosterImport, {
				year,
				grade: draft.grade,
				rows: rowsToSend(),
				approvedNameChanges: approved,
				...(e2eTagFromUrl() === undefined ? {} : { e2eTag: e2eTagFromUrl() })
			});
			onApplied({
				grade: draft.grade,
				fileName: draft.fileName,
				appliedAt: Date.now(),
				added: result.added,
				moved: result.moved,
				renamed: result.renamed,
				disabled: result.disabled,
				declinedRenames: result.declinedRenames
			});
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The import failed';
		} finally {
			applying = false;
		}
	}
</script>

<section
	class="rounded-lg border border-emerald-200 bg-white p-4"
	data-testid="esl-import.card.g{draft.grade}"
	aria-label="Grade {draft.grade} dry run"
>
	<header class="mb-3 flex flex-wrap items-center gap-2">
		<h3 class="font-semibold">Grade {draft.grade}</h3>
		<Badge variant="secondary" data-testid="esl-import.card.file">{draft.fileName}</Badge>
		<span class="text-muted-foreground text-sm">
			{draft.students.length} students staged
		</span>
	</header>

	{#if draft.rejected.length > 0 || draft.skipped.length > 0}
		<details class="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
			<summary class="cursor-pointer font-medium">
				{draft.rejected.length} row(s) could not be read,
				{draft.skipped.length} sheet(s) set aside
			</summary>
			<ul class="mt-2 space-y-1">
				{#each draft.skipped as sheet (sheet.sheetName)}
					<li data-testid="esl-import.skipped.{sheet.sheetName}">
						<span class="font-medium">{sheet.sheetName}</span> — {sheet.reason}
					</li>
				{/each}
				{#each draft.rejected as row (row.sheetName + row.rowNumber)}
					<li data-testid="esl-import.rejected.{row.sheetName}.{row.rowNumber}">
						<span class="font-medium">{row.sheetName} row {row.rowNumber}</span> — {row.reason}
					</li>
				{/each}
			</ul>
			<p class="text-muted-foreground mt-2">
				The readable rows still import. Fix these in the workbook and upload it again to include
				them.
			</p>
		</details>
	{/if}

	{#if loading}
		<p class="text-muted-foreground text-sm" data-testid="esl-import.plan.loading">
			Reading the current roster…
		</p>
	{:else if plan === null}
		<p class="text-muted-foreground text-sm">No plan yet.</p>
	{:else}
		{#if plan.duplicateIds.length > 0 || plan.ambiguousIds.length > 0}
			<div
				class="mb-3 flex gap-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900"
				data-testid="esl-import.plan.blocked"
			>
				<AlertTriangle class="size-4 shrink-0" />
				<div>
					{#if plan.duplicateIds.length > 0}
						<p>
							{plan.duplicateIds.length} student ID(s) appear more than once in this file ({plan.duplicateIds
								.slice(0, 5)
								.join(', ')}). Applying it would enrol one and disable another.
						</p>
					{/if}
					{#if plan.ambiguousIds.length > 0}
						<p>
							{plan.ambiguousIds.length} student ID(s) have more than one record in
							{year} ({plan.ambiguousIds.slice(0, 5).join(', ')}), so this file cannot be matched to
							them.
						</p>
					{/if}
				</div>
			</div>
		{/if}

		<dl
			class="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5"
			data-testid="esl-import.plan.totals"
		>
			{#each [['New', plan.totals.new], ['Moved', plan.totals.levelChange], ['Renamed', plan.totals.nameChange], ['Disabled', plan.totals.disabled], ['Unchanged', plan.totals.unchanged]] as [label, count] (label)}
				<div class="rounded border px-2 py-1">
					<dt class="text-muted-foreground">{label}</dt>
					<dd class="font-semibold" data-testid="esl-import.plan.total.{label}">{count}</dd>
				</div>
			{/each}
		</dl>

		<details class="mb-3 text-sm" data-testid="esl-import.plan.cohorts">
			<summary class="cursor-pointer font-medium">
				{classesByCohort.length}
				{classesByCohort.length === 1 ? 'class' : 'classes'} this file fills
			</summary>
			<ul class="mt-2 space-y-1">
				{#each classesByCohort as entry (entry.key)}
					<li data-testid="esl-import.plan.cohort.{entry.key}">
						<span class="font-medium">
							{cohortLabelOf(entry.key)}{entry.section}
						</span>
						— {entry.count} students
					</li>
				{/each}
			</ul>
		</details>

		{#if nameChanges.length > 0}
			<div class="mb-3 rounded border border-amber-300 bg-amber-50 p-2">
				<p class="mb-1 text-sm font-medium">
					{nameChanges.length} English name change(s). Tick the ones to apply.
				</p>
				<ul class="space-y-1 text-sm">
					{#each nameChanges as change (change.studentId)}
						{#if change.kind === 'nameChange'}
							<li class="flex items-center gap-2">
								<input
									type="checkbox"
									id="rename-{change.studentId}"
									data-testid="esl-import.rename.{change.schoolStudentId}"
									checked={approved.includes(asStudentId(change.studentId))}
									onchange={() => toggleRename(asStudentId(change.studentId))}
								/>
								<label for="rename-{change.studentId}">
									{change.schoolStudentId}:
									<span class="line-through">{change.from || '(none)'}</span> →
									<span class="font-medium">{change.to}</span>
								</label>
							</li>
						{/if}
					{/each}
				</ul>
				<p class="text-muted-foreground mt-1 text-xs">
					Unticked names keep what is stored. A blank in the file never clears a name.
				</p>
			</div>
		{/if}

		{#if error}
			<p
				class="mb-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900"
				data-testid="esl-import.error"
			>
				{error}
			</p>
		{/if}

		<Button
			onclick={apply}
			disabled={applying || blocked}
			data-testid="esl-import.apply.{draft.grade}"
		>
			<Check class="size-4" />
			{applying ? 'Applying…' : `Apply grade ${draft.grade}`}
		</Button>
		{#if blocked}
			<p class="text-muted-foreground mt-1 text-xs">
				This file cannot be applied until the problems above are fixed.
			</p>
		{/if}
	{/if}
</section>
