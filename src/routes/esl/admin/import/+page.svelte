<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { ParsedRosterWorkbook } from '$convex/shared/esl_import';
	import { readRosterWorkbook } from './workbook';
	import {
		IMPORT_GRADES,
		clearEntry,
		readYearDraft,
		schoolYearOf,
		writeEntry,
		type GradeEntry,
		type ImportedGrade
	} from './staging';
	import StagedGradeCard from './StagedGradeCard.svelte';

	const initialYear = schoolYearOf(new Date());
	let year = $state(initialYear);
	/** The year whose draft `yearDraft` holds, so a change re-reads exactly once. */
	let loadedYear = initialYear;
	/**
	 * The grade of the next file. The workbooks do not state their grade in one
	 * reliable place — sheet names are abbreviated, and grade 10's sheets are named
	 * after their base class — so the admin says which file this is.
	 */
	/**
	 * The grade of the next file, as the select holds it: a string, because that is
	 * what a `<select>` value is. `grade` below is the number the rest of the page
	 * uses, so nothing has to remember which of the two it is holding.
	 */
	let gradeChoice = $state('9');
	const grade = $derived(Number(gradeChoice));

	let parsing = $state(false);
	let error = $state('');
	/** A file that parsed, but whose year disagrees with the page's. */
	let yearPrompt = $state<{
		fileName: string;
		derivedYear: string;
		parsed: ParsedRosterWorkbook;
	} | null>(null);

	/**
	 * The stored draft, re-read when the year changes.
	 *
	 * `yearDraft` is written as grades are staged and applied, so the year view and
	 * the cards come from one source: a draft left by an earlier visit appears
	 * without anything being re-uploaded.
	 */
	let yearDraft = $state(readYearDraft(loadedYear));

	$effect(() => {
		// Re-read on the year, not on every keystroke of it: a half-typed year is
		// not a year, and would show an empty draft for a key that is not a year.
		//
		// Compared against a plain variable rather than `yearDraft`, because reading
		// the state this effect also writes would make it depend on its own output —
		// and an effect that re-triggers itself never settles.
		const trimmed = year.trim();
		if (!/^\d{4}-\d{4}$/.test(trimmed) || trimmed === loadedYear) return;
		loadedYear = trimmed;
		yearDraft = readYearDraft(trimmed);
	});

	const entries = $derived(yearDraft.grades);
	const stagedGrades = $derived(
		IMPORT_GRADES.filter((g) => entries[String(g)]?.status === 'staged')
	);

	function persistYear(): string {
		const trimmed = year.trim();
		if (/^\d{4}-\d{4}$/.test(trimmed)) year = trimmed;
		return year;
	}

	async function onFilePicked(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		// Cleared so choosing the same file again still fires a change event.
		input.value = '';
		if (!file) return;

		parsing = true;
		error = '';
		yearPrompt = null;
		try {
			const parsed = await readRosterWorkbook(file, grade);
			const derived = parsed.derivedYear;

			if (derived.kind === 'conflict') {
				error = `This workbook holds more than one school year (${derived.years.join(' and ')}). Import it as two files, one per year.`;
				return;
			}
			if (derived.kind === 'unsupported' && grade !== 10) {
				error = derived.reason;
				return;
			}
			// Grade 10 is the one grade whose IDs cannot name a year, so there is
			// nothing to check the field against. The year above is the admin's
			// statement, and it is staged under exactly that — not under a guess.
			if (derived.kind === 'current' && derived.year !== year.trim()) {
				// Asked rather than assumed: the arithmetic is shown and the admin
				// decides, because importing into the wrong year is silent.
				yearPrompt = { fileName: file.name, derivedYear: derived.year, parsed };
				return;
			}
			stage(file.name, parsed);
		} catch (cause) {
			error =
				cause instanceof Error
					? `Could not read ${file.name}: ${cause.message}`
					: `Could not read ${file.name}`;
		} finally {
			parsing = false;
		}
	}

	/** True while the year's cohorts are being carried into the next year. */
	let advancing = $state(false);
	/** What the last advance did, or refused, per grade. */
	let advanceReport = $state<{ fromGrade: number; advanced: boolean; detail: string }[]>([]);

	/**
	 * Carries the year forward, then stages the file into it.
	 *
	 * Grades 7 and 8 are the only ones that carry: grade 9 graduates into a
	 * student-ID scheme that cannot be linked, and grade 10 is the new year's own
	 * intake, created by its own file. Both grades run as one step because the
	 * admin is turning the year over, not advancing a grade, and stopping between
	 * them would leave the year half-built.
	 *
	 * Every grade's outcome is reported, including one that carried nothing: a
	 * report that silently omitted a grade would read as "all of it worked".
	 */
	async function advanceAndStage() {
		if (!yearPrompt) return;
		const prompt = yearPrompt;
		advancing = true;
		error = '';
		advanceReport = [];
		try {
			const client = useConvexClient();
			const report: typeof advanceReport = [];
			for (const fromGrade of [7, 8]) {
				const result = await client.mutation(api.esl.import.advanceGrade, {
					fromYear: year.trim(),
					toYear: prompt.derivedYear,
					fromGrade
				});
				report.push(
					result.advanced
						? {
								fromGrade,
								advanced: true,
								detail: `G${fromGrade} → G${result.toGrade}: ${result.cohortsCreated} cohort(s), ${result.studentsCarried} student(s)`
							}
						: { fromGrade, advanced: false, detail: result.reason }
				);
			}
			advanceReport = report;
			// The year the file's own IDs name, which is also the year just carried
			// into — so the page and the data cannot disagree about which is which.
			year = prompt.derivedYear;
			stage(prompt.fileName, prompt.parsed);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The year could not be advanced';
		} finally {
			advancing = false;
		}
	}

	function stage(fileName: string, parsed: ParsedRosterWorkbook) {
		persistYear();
		writeEntry(year.trim(), grade, {
			status: 'staged',
			draft: {
				grade,
				fileName,
				stagedAt: Date.now(),
				students: parsed.students,
				skipped: parsed.skipped.map((sheet) => ({
					sheetName: sheet.sheetName,
					kind: sheet.kind,
					reason: sheet.reason
				})),
				rejected: parsed.rejected.map((row) => ({
					sheetName: row.sheetName,
					rowNumber: row.rowNumber,
					reason: row.reason
				})),
				derivedYear: parsed.derivedYear
			}
		});
		yearDraft = readYearDraft(year.trim());
		yearPrompt = null;
	}

	function acceptDerivedYear() {
		if (!yearPrompt) return;
		// Switching the page's year and staging in one step, so the two cannot
		// disagree: the draft is namespaced by the year it was parsed for.
		year = yearPrompt.derivedYear;
		stage(yearPrompt.fileName, yearPrompt.parsed);
	}

	function onApplied(result: ImportedGrade) {
		persistYear();
		// The draft is replaced by the result rather than kept: the parsed rows are
		// spent, and the status view needs the counts and the time, not the file.
		writeEntry(year.trim(), result.grade, { status: 'imported', result });
		yearDraft = readYearDraft(year.trim());
	}

	function discard(gradeToClear: number) {
		persistYear();
		clearEntry(year.trim(), gradeToClear);
		yearDraft = readYearDraft(year.trim());
	}

	function entryOf(gradeToFind: number): GradeEntry | undefined {
		return entries[String(gradeToFind)];
	}

	function stamp(at: number): string {
		return new Date(at).toLocaleString();
	}
</script>

<svelte:head>
	<title>Import roster · ESL admin</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-6 p-4">
	<header>
		<h1 class="text-xl font-semibold">Import roster</h1>
		<p class="text-muted-foreground text-sm">
			Upload a grade's workbook. Nothing is written until you apply it, and each file is applied on
			its own.
		</p>
	</header>

	<section class="rounded-lg border border-emerald-200 bg-white p-4">
		<div class="flex flex-wrap items-end gap-3">
			<div class="space-y-1">
				<Label for="year">School year</Label>
				<Input
					id="year"
					data-testid="esl-import.year"
					class="w-36"
					bind:value={year}
					onblur={persistYear}
					placeholder="2026-2027"
				/>
			</div>
			<div class="space-y-1">
				<Label for="grade">This file's grade</Label>
				<NativeSelect.Root data-testid="esl-import.grade" bind:value={gradeChoice}>
					{#each IMPORT_GRADES as option (option)}
						<NativeSelect.Option value={String(option)}>Grade {option}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
			<div class="space-y-1">
				<Label for="file">Workbook (.xlsx)</Label>
				<input
					id="file"
					type="file"
					accept=".xlsx"
					data-testid="esl-import.file"
					onchange={onFilePicked}
					class="text-sm"
				/>
			</div>
			{#if parsing}
				<span class="text-muted-foreground pb-2 text-sm">Reading the file…</span>
			{/if}
		</div>

		{#if yearPrompt}
			<div
				class="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm"
				data-testid="esl-import.yearPrompt"
			>
				<p>
					{yearPrompt.fileName} holds IDs that indicate school year
					<strong>{yearPrompt.derivedYear}</strong>, but this page is set to
					<strong>{year.trim()}</strong>. Its {yearPrompt.parsed.students.length} student(s) would be
					matched against the wrong year.
				</p>
				<div class="mt-2 flex gap-2">
					<Button
						size="sm"
						onclick={advanceAndStage}
						disabled={advancing}
						data-testid="esl-import.yearPrompt.advance"
					>
						{advancing
							? 'Advancing…'
							: `Advance ${year.trim()} into ${yearPrompt.derivedYear} and use it`}
					</Button>
					<Button size="sm" onclick={acceptDerivedYear} data-testid="esl-import.yearPrompt.accept">
						Use {yearPrompt.derivedYear}
					</Button>
					<Button
						size="sm"
						variant="outline"
						onclick={() => (yearPrompt = null)}
						data-testid="esl-import.yearPrompt.dismiss"
					>
						Keep {year.trim()}
					</Button>
				</div>
			</div>
		{/if}
		{#if advanceReport.length > 0}
			<ul class="mt-2 space-y-1 text-xs" data-testid="esl-import.advanceReport">
				{#each advanceReport as entry (entry.fromGrade)}
					<li data-testid="esl-import.advanceReport.g{entry.fromGrade}">
						<strong>G{entry.fromGrade}</strong> — {entry.detail}
					</li>
				{/each}
			</ul>
		{/if}

		{#if error}
			<p
				class="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900"
				data-testid="esl-import.error"
			>
				{error}
			</p>
		{/if}
	</section>

	<section aria-label="The year so far" data-testid="esl-import.status">
		<h2 class="mb-2 font-semibold">{year.trim()}</h2>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Grade</Table.Head>
					<Table.Head>State</Table.Head>
					<Table.Head>File</Table.Head>
					<Table.Head>Counts</Table.Head>
					<Table.Head>When</Table.Head>
					<Table.Head></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each IMPORT_GRADES as row (row)}
					{@const entry = entryOf(row)}
					<Table.Row data-testid="esl-import.status.g{row}">
						<Table.Cell class="font-medium">G{row}</Table.Cell>
						<Table.Cell>
							{#if entry === undefined}
								<span class="text-muted-foreground" data-testid="esl-import.status.g{row}.state">
									Not yet provided
								</span>
							{:else if entry.status === 'staged'}
								<Badge variant="secondary" data-testid="esl-import.status.g{row}.state">
									Staged
								</Badge>
							{:else}
								<Badge data-testid="esl-import.status.g{row}.state">Imported</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if entry?.status === 'staged'}
								{entry.draft.fileName}
							{:else if entry?.status === 'imported'}
								{entry.result.fileName}
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if entry?.status === 'staged'}
								{entry.draft.students.length} staged
							{:else if entry?.status === 'imported'}
								{entry.result.added} new, {entry.result.moved} moved,
								{entry.result.renamed} renamed, {entry.result.disabled} disabled
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if entry?.status === 'staged'}
								staged {stamp(entry.draft.stagedAt)}
							{:else if entry?.status === 'imported'}
								applied {stamp(entry.result.appliedAt)}
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right">
							{#if entry !== undefined}
								<Button
									size="sm"
									variant="outline"
									onclick={() => discard(row)}
									data-testid="esl-import.discard.g{row}"
								>
									{entry.status === 'staged' ? 'Discard' : 'Clear'}
								</Button>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</section>

	{#each stagedGrades as stagedGrade (stagedGrade)}
		{@const entry = entryOf(stagedGrade)}
		{#if entry?.status === 'staged'}
			<StagedGradeCard year={year.trim()} draft={entry.draft} {onApplied} />
		{/if}
	{/each}
</main>
