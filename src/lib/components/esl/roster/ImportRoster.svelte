<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Upload } from '@lucide/svelte';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { ParsedRosterWorkbook } from '$convex/shared/esl_import';
	import {
		deriveGradeForSchoolYear,
		deriveSchoolYear,
		gradesNamedInWorkbook
	} from '$convex/shared/esl_import';
	import { readRosterSheets, collectStudentIds, parseRosterSheets } from './workbook';
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

	let {
		expanded = false,
		initialYear = schoolYearOf(new Date())
	}: { expanded?: boolean; initialYear?: string } = $props();
	let year = $state(initialYear);
	/** The year whose draft `yearDraft` holds, so a change re-reads exactly once. */
	let loadedYear = initialYear;

	let parsing = $state(false);
	let error = $state('');
	/** Per-file errors from the most recent batch. */
	let errors = $state<string[]>([]);
	let fileInput = $state<HTMLInputElement | null>(null);
	let dragCounter = $state(0);
	const isDraggingOver = $derived(dragCounter > 0);
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

	// Follow the page's year when it changes, so the importer and the roster on
	// screen are the same school year. The admin can still type a different year;
	// this only reacts to a new value from the parent.
	$effect(() => {
		const next = initialYear.trim();
		if (!/^\d{4}-\d{4}$/.test(next) || next === loadedYear) return;
		year = next;
		loadedYear = next;
		yearDraft = readYearDraft(next);
	});

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

	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		dragCounter++;
	}
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}
	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		dragCounter--;
	}
	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragCounter = 0;
		const dropped = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
			f.name.toLowerCase().endsWith('.xlsx')
		);
		if (dropped.length === 0) return;
		// Synthesize a change event by feeding files into onFilePicked path.
		void (async () => {
			parsing = true;
			error = '';
			errors = [];
			yearPrompt = null;
			try {
				for (const file of dropped) {
					const raisedPrompt = await processOneFile(file);
					if (raisedPrompt) break;
				}
			} finally {
				parsing = false;
			}
		})();
	}
	function handleBrowseClick() {
		fileInput?.click();
	}
	function handleKeyUp(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleBrowseClick();
		}
	}

	async function processOneFile(file: File): Promise<boolean> {
		// Returns true if a year prompt was raised (caller should stop batching).
		const chosenYear = year.trim();
		try {
			const sheets = await readRosterSheets(file);
			const ids = collectStudentIds(sheets);

			const placement = deriveGradeForSchoolYear(chosenYear, ids);

			if (placement.kind === 'twoYears') {
				errors = [
					...errors,
					placement.years.length > 0
						? `${file.name}: holds more than one school year (${placement.years.join(' and ')}). Import as two files, one per year.`
						: `${file.name}: holds grade 10 and levelled-grade students. Import as two files, one per grade.`
				];
				return false;
			}

			if (placement.kind === 'unknown') {
				errors = [
					...errors,
					`${file.name}: student IDs are on no scheme this can read. Check it is a department roster.`
				];
				return false;
			}

			const grade = placement.grade;
			const parsed = parseRosterSheets(grade, sheets);
			const derived = parsed.derivedYear;

			if (derived.kind === 'conflict') {
				errors = [
					...errors,
					`${file.name}: holds more than one school year (${derived.years.join(' and ')}). Import as two files, one per year.`
				];
				return false;
			}
			if (derived.kind === 'unsupported') {
				errors = [...errors, `${file.name}: ${derived.reason}`];
				return false;
			}

			const yearTheFileClaims = grade === 10 ? grade10YearFor(ids) : groupColumnYear(parsed);

			if (yearTheFileClaims !== null && yearTheFileClaims !== chosenYear) {
				yearPrompt = { fileName: file.name, derivedYear: yearTheFileClaims, parsed };
				return true;
			}

			stage(file.name, parsed);
			return false;
		} catch (cause) {
			errors = [
				...errors,
				cause instanceof Error
					? `Could not read ${file.name}: ${cause.message}`
					: `Could not read ${file.name}`
			];
			return false;
		}
	}

	async function onFilePicked(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		// Cleared so choosing the same files again still fires a change event.
		input.value = '';
		if (files.length === 0) return;

		parsing = true;
		error = '';
		errors = [];
		yearPrompt = null;
		try {
			for (const file of files) {
				const raisedPrompt = await processOneFile(file);
				if (raisedPrompt) break;
			}
		} finally {
			parsing = false;
		}
	}

	/**
	 * The school year a levelled workbook claims, from the grade its own
	 * `ESL Group` column names, or `null` when the column says nothing useful.
	 *
	 * Read from the grade the *file* names rather than the one it was read as, which
	 * is the whole point: the file is read as whatever the page's year implies, and
	 * the column is the one thing in it that was written down independently. Used
	 * only to fill in the year prompt, which exists precisely because the two
	 * disagree — so quoting the derived grade's answer back would restate the wrong
	 * number and tell the admin nothing.
	 */
	function groupColumnYear(parsed: ParsedRosterWorkbook): string | null {
		const named = gradesNamedInWorkbook(parsed);
		if (named.length === 0) return null;
		const grade = named.length === 1 ? named[0] : parsed.grade;
		const derived = deriveSchoolYear(
			grade,
			parsed.students.map((student) => student.schoolStudentId)
		);
		return derived.kind === 'current' ? derived.year : null;
	}

	/**
	 * The school year a grade 10 workbook claims, from the reversed ROC year its
	 * IDs are written with, or `null` when they name no such year.
	 *
	 * Grade 10's IDs name the school year itself rather than an intake year, so
	 * unlike the levelled grades there is no offset to apply: `411xxx` is
	 * 2025-2026 outright. That is what lets a grade 10 file be checked against
	 * the year on the page the same way a levelled file is.
	 */
	function grade10YearFor(ids: readonly string[]): string | null {
		const derived = deriveSchoolYear(10, ids);
		return derived.kind === 'current' ? derived.year : null;
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
								detail: `G${fromGrade} → G${result.toGrade}: ${result.cohortsCreated} cohorts, ${result.studentsCarried} students`
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
		// `parsed.grade`, not a grade the page is holding: the grade belongs to the
		// file, and it is whatever this workbook was actually read as.
		writeEntry(year.trim(), parsed.grade, {
			status: 'staged',
			draft: {
				grade: parsed.grade,
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

	/**
	 * Whether the import UI is showing.
	 *
	 * Seeded from `expanded` and then owned by the admin: arriving with `#import`
	 * opens the section once, and after that it is the admin's to open and close.
	 * Tracking `expanded` live would let an unrelated parent re-render push it back
	 * open, so the request is read once rather than derived — which is also what
	 * silences the "captures only the initial value" warning.
	 */
	let opened = $state(true);

	$effect(() => {
		if (expanded) opened = true;
	});
</script>

<!--
	A single button until it is wanted.

	The import used to sit in a bordered panel with a heading and a paragraph of
	explanation, which put three pieces of chrome above a list of classes for a task
	most visits never perform. It now takes one button's worth of space, and grows
	into the full UI only when opened.

	`basis-full` on the panel is what lets this live inside the page header's flex
	row and still drop onto its own line: the button sits beside the title, and the
	expanded panel wraps beneath both rather than squeezing into the header.
-->
{#if opened}
	<div class="basis-full space-y-4 rounded-lg border border-emerald-200 bg-white p-4">
		<div class="space-y-4">
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
					<!--
				Every grade comes from the file's own IDs, so there is no grade control
				to show. The levelled grades place from the year above and their
				intake-year prefixes; grade 10 places from its own ID space.
			-->
					<div class="space-y-1">
						<Label>Workbook (.xlsx)</Label>
						<input
							bind:this={fileInput}
							id="file"
							type="file"
							accept=".xlsx"
							multiple
							data-testid="esl-import.file"
							onchange={onFilePicked}
							class="hidden"
						/>
						<div
							role="button"
							tabindex="0"
							aria-label="Drag and drop workbook files"
							data-testid="esl-import.dropzone"
							ondragenter={handleDragEnter}
							ondragover={handleDragOver}
							ondragleave={handleDragLeave}
							ondrop={handleDrop}
							onkeyup={handleKeyUp}
							class={[
								'cursor-pointer rounded-lg border-2 border-dashed text-center transition-colors',
								isDraggingOver
									? 'border-emerald-500 bg-emerald-50'
									: 'border-emerald-300 bg-slate-50'
							]}
						>
							{#if parsing}
								<div class="flex flex-col items-center gap-2 px-3 py-3">
									<span class="text-sm text-gray-700">Reading files…</span>
								</div>
							{:else}
								<div class="flex flex-col items-center gap-2 px-3 py-3">
									<Upload class="size-5 text-emerald-600" />
									<p class="text-sm text-gray-700">
										Drag and drop workbook(s) here
										<span class="text-gray-500">— or —</span>
									</p>
									<Button
										size="sm"
										variant="outline"
										onclick={handleBrowseClick}
										data-testid="esl-import.browse"
									>
										Browse…
									</Button>
								</div>
							{/if}
						</div>
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
							<strong>{year.trim()}</strong>. Its {yearPrompt.parsed.students.length} students would be
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
							<Button
								size="sm"
								onclick={acceptDerivedYear}
								data-testid="esl-import.yearPrompt.accept"
							>
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
				{#if errors.length > 0}
					<ul
						class="mt-3 space-y-1 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900"
						data-testid="esl-import.errors"
					>
						{#each errors as e (e)}
							<li data-testid="esl-import.error.item">{e}</li>
						{/each}
					</ul>
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
										<span
											class="text-muted-foreground"
											data-testid="esl-import.status.g{row}.state"
										>
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
										{entry.result.renamed} renamed, {entry.result.rehomed} rehomed,
										{entry.result.disabled} disabled
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
		</div>
	</div>
{/if}
