<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { ParsedRosterWorkbook } from '$convex/shared/esl_import';
	import {
		deriveGrade10SchoolYear,
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

	const initialYear = schoolYearOf(new Date());
	let year = $state(initialYear);
	/** The year whose draft `yearDraft` holds, so a change re-reads exactly once. */
	let loadedYear = initialYear;

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
			const chosenYear = year.trim();
			const sheets = await readRosterSheets(file);
			const ids = collectStudentIds(sheets);

			// The grade comes from the year the admin has already confirmed and the
			// file's own IDs, so no file needs a grade asked of them. The levelled
			// grades come from their intake-year prefixes; grade 10 comes from its own
			// ID space, which no other grade is numbered in.
			const placement = deriveGradeForSchoolYear(chosenYear, ids);

			// A file holding two school years is the merged-year fault, reported before
			// anything is parsed. It is not a file that needs its grade stating.
			if (placement.kind === 'twoYears') {
				error =
					placement.years.length > 0
						? `This workbook holds more than one school year (${placement.years.join(' and ')}). Import it as two files, one per year.`
						: 'This workbook holds grade 10 students and levelled-grade students. Import it as two files, one per grade.';
				return;
			}

			if (placement.kind === 'unknown') {
				error =
					"This workbook's student IDs are on no scheme this can read, so it cannot be placed. Check the file is a department roster.";
				return;
			}

			const grade = placement.grade;
			const parsed = parseRosterSheets(grade, sheets);
			const derived = parsed.derivedYear;

			if (derived.kind === 'conflict') {
				error = `This workbook holds more than one school year (${derived.years.join(' and ')}). Import it as two files, one per year.`;
				return;
			}
			if (derived.kind === 'unsupported' && grade !== 10) {
				error = derived.reason;
				return;
			}

			// The grade above is settled by the IDs and nothing else — they are
			// unique and their relationship to the ROC year is fixed, so there is no
			// second opinion to take on it.
			//
			// What the IDs alone cannot say is whether the *year* on this page is the
			// one the admin means: set it to 2027-2028 and a grade 7 file's `115xxxx`
			// IDs resolve cleanly to grade 8, consistently and wrongly. So each grade
			// says what year it belongs to in its own way, and both are checked here.
			//
			// Either way this is a signal about the year, not about the grade — it
			// exists to offer the year advance before staging, not to second-guess the
			// import.
			const yearTheFileClaims = grade === 10 ? grade10YearFor(ids) : groupColumnYear(parsed);

			// Grade 10's `ESL Group` column names the class, not the year, so there is
			// nothing in it to disagree with. The year above stands as the admin's
			// statement for that grade.
			if (yearTheFileClaims !== null && yearTheFileClaims !== chosenYear) {
				yearPrompt = { fileName: file.name, derivedYear: yearTheFileClaims, parsed };
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
	 * The school year a grade 10 workbook claims, from the space its IDs are
	 * numbered in, or `null` when they name no space.
	 *
	 * Grade 10's space moves one step per school year, so unlike the levelled
	 * grades — whose IDs name an intake year the page's year is then read against —
	 * this one reads the year straight out of the IDs. `5xxxxx` is 2026-2027,
	 * `6xxxxx` the year after.
	 */
	function grade10YearFor(ids: readonly string[]): string | null {
		const derived = deriveGrade10SchoolYear(ids);
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
			<!--
				Every grade comes from the file's own IDs, so there is no grade control
				to show. The levelled grades place from the year above and their
				intake-year prefixes; grade 10 places from its own ID space.
			-->
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
					<strong>{year.trim()}</strong>. Its {yearPrompt.parsed.students.length} students would be matched
					against the wrong year.
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
