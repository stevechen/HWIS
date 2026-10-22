<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import type { GovImportResult, GovPreviewResult } from '$convex/esl/holidays';
	import type { OffDayStampReport } from '$convex/esl/holidayWrites';
	import { decodeHolidayBytes } from '$convex/shared/esl';
	import { Button } from '$lib/components/ui/button';
	import { humanConvexErrorMessage } from '$lib/convex-error';
	import { semesterUploadYears } from '$lib/esl-semesters';
	import { Download, FileText, X } from '@lucide/svelte';

	/**
	 * Holiday off days → events, two paths sharing one card.
	 *
	 * Automatic (top): pick the ROC calendar years, preview the named off
	 * days the government feed resolves for this semester, import — the
	 * server scrapes dataset 14718, stamps the events, and refreshes the
	 * holiday cache. Manual (bottom): the same CSV via drag-and-drop, for
	 * when the feed is unreachable or the file is hand-edited.
	 *
	 * Drop zone mirrors HWIS-Class_Scheduler's signature upload:
	 * drag-counter highlight, hidden file input, browse button,
	 * keyboard-operable, same file re-pickable after removal.
	 */

	let {
		semesterId,
		term,
		startDate,
		onImported
	}: {
		semesterId: Id<'esl_semesters'>;
		term: 'S1' | 'S2';
		startDate: string;
		/**
		 * Called with the exact off days this import wrote (never the ones
		 * it skipped). The edit wizard (#256) merges these into its Step 2
		 * state so a later save cannot contradict the written rows.
		 */
		onImported?: (days: { date: string; name: string }[]) => void;
	} = $props();

	const client = useConvexClient();

	type GovYearOption = { rocYear: string; gregorian: string; checked: boolean };

	// Snapshot-at-mount: the page remounts per semester (`{#key}`), so the
	// options can never go stale behind a prop change.
	// svelte-ignore state_referenced_locally
	let govYears = $state<GovYearOption[]>(
		semesterUploadYears(term, startDate).map((gregorian) => ({
			rocYear: String(Number(gregorian) - 1911),
			gregorian,
			checked: true
		}))
	);
	let previewing = $state(false);
	let govImporting = $state(false);
	let govError = $state<string | null>(null);
	let govPreview = $state<GovPreviewResult | null>(null);
	let govReport = $state<GovImportResult | null>(null);

	const pickedYears = $derived(govYears.filter((option) => option.checked).map((o) => o.rocYear));
	const canPreview = $derived(pickedYears.length > 0 && !previewing && !govImporting);
	const canGovImport = $derived(govPreview !== null && !previewing && !govImporting);

	function toggleGovYear(rocYear: string, checked: boolean) {
		const option = govYears.find((o) => o.rocYear === rocYear);
		if (option) option.checked = checked;
		govPreview = null;
		govReport = null;
		govError = null;
	}

	async function previewGov() {
		if (!canPreview) return;
		previewing = true;
		govError = null;
		govPreview = null;
		govReport = null;
		try {
			govPreview = await client.action(api.esl.holidays.previewGovImport, {
				semesterId,
				rocYears: pickedYears
			});
		} catch (cause) {
			govError = humanConvexErrorMessage(cause);
		} finally {
			previewing = false;
		}
	}

	async function importGov() {
		if (!canGovImport) return;
		govImporting = true;
		govError = null;
		govReport = null;
		try {
			govReport = await client.action(api.esl.holidays.importGovOffDays, {
				semesterId,
				rocYears: pickedYears
			});
			// The semester changed underneath the preview — drop it so a
			// second click cannot double-stamp from stale data.
			govPreview = null;
			onImported?.(govReport.events.insertedDays);
		} catch (cause) {
			govError = humanConvexErrorMessage(cause);
		} finally {
			govImporting = false;
		}
	}

	let file = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let dragCounter = $state(0);
	const isDraggingOver = $derived(dragCounter > 0);
	let importing = $state(false);
	let error = $state<string | null>(null);
	let report = $state<OffDayStampReport | null>(null);

	const canImport = $derived(file !== null && !importing);

	function takeFile(next: File | null) {
		file = next;
		error = null;
		report = null;
	}

	function pickFile(event: Event) {
		const input = event.target as HTMLInputElement;
		takeFile(input.files?.[0] ?? null);
		// Reset so the same file can be picked again after removal.
		input.value = '';
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
		const dropped = event.dataTransfer?.files[0];
		takeFile(dropped ?? null);
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

	function removeFile(event: MouseEvent) {
		event.stopPropagation();
		takeFile(null);
		if (fileInput) fileInput.value = '';
	}

	async function importOffDays() {
		if (file === null || importing) return;
		importing = true;
		error = null;
		report = null;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const csvText = decodeHolidayBytes(bytes);
			report = await client.mutation(api.esl.holidays.importOffDays, {
				semesterId,
				csvText
			});
			onImported?.(report.insertedDays);
		} catch (cause) {
			error = humanConvexErrorMessage(cause);
		} finally {
			importing = false;
		}
	}
</script>

<section data-testid="esl-offday-import.root" class="space-y-4 rounded-lg border bg-white p-4">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-base font-semibold text-emerald-900">Holiday off days → events</h2>
		<a
			href="https://data.gov.tw/dataset/14718"
			target="_blank"
			rel="noopener noreferrer"
			data-testid="esl-offday-import.dataset-link"
			class="text-sm font-medium text-emerald-800 hover:underline"
		>
			Dataset 14718
		</a>
	</div>

	<div class="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
		<h3 class="text-sm font-semibold text-emerald-900">Import automatically</h3>
		<p class="text-sm text-gray-600">
			Pick the calendar years — the app reads the official files straight from the government and
			shows what would be added before anything is written.
		</p>
		<div class="flex flex-wrap items-center gap-4">
			{#each govYears as option (option.rocYear)}
				<label class="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
					<input
						type="checkbox"
						checked={option.checked}
						onchange={(event) => toggleGovYear(option.rocYear, event.currentTarget.checked)}
						data-testid={`esl-offday-import.gov-year-${option.rocYear}`}
						class="size-4 accent-emerald-700"
					/>
					ROC {option.rocYear} ({option.gregorian})
				</label>
			{/each}
			<Button
				size="sm"
				variant="outline"
				disabled={!canPreview}
				onclick={previewGov}
				data-testid="esl-offday-import.gov-preview"
			>
				{previewing ? 'Reading…' : 'Preview'}
			</Button>
		</div>

		{#if govError}
			<p
				data-testid="esl-offday-import.gov-error"
				class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
			>
				{govError}
			</p>
		{/if}

		{#if govPreview}
			<div data-testid="esl-offday-import.gov-preview-result" class="space-y-2 text-sm">
				<ul class="space-y-0.5 text-gray-700">
					{#each govPreview.years as year (year.rocYear)}
						<li>
							ROC {year.rocYear}:
							{#if year.status === 'ok'}
								{year.holidays} day{year.holidays === 1 ? '' : 's'} off in the file{#if year.fileName !== null}
									<span class="text-gray-500">({year.fileName})</span>{/if}
							{:else if year.status === 'missing'}
								<span class="text-amber-800">not published yet — skipped</span>
							{:else}
								<span class="text-amber-800">could not be read — skipped</span>
							{/if}
						</li>
					{/each}
				</ul>
				{#if govPreview.days.length > 0}
					<p class="font-medium text-gray-800">
						{govPreview.days.length} would be added:
					</p>
					<ul class="max-h-40 space-y-0.5 overflow-y-auto pl-1 text-gray-700">
						{#each govPreview.days as day (day.date)}
							<li>
								{day.date} — {day.name}{#if day.needsReview}
									<span class="text-amber-800">(translation needs a check)</span>{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-gray-600">Nothing new would be added.</p>
				{/if}
				{#if govPreview.skippedTaken > 0 || govPreview.outOfRange > 0 || govPreview.plainWeekends > 0 || govPreview.weekendHolidays > 0}
					<p class="text-xs text-gray-500">
						Skipped: {govPreview.skippedTaken} already have events, {govPreview.outOfRange}
						outside this semester, {govPreview.plainWeekends} plain weekends,
						{govPreview.weekendHolidays} named weekend days.
					</p>
				{/if}
				<Button
					size="sm"
					disabled={!canGovImport}
					onclick={importGov}
					data-testid="esl-offday-import.gov-import"
				>
					{govImporting ? 'Importing…' : 'Import these off days'}
				</Button>
			</div>
		{/if}

		{#if govReport}
			<div data-testid="esl-offday-import.gov-report" class="space-y-2 text-sm">
				<p class="rounded border border-emerald-200 bg-emerald-50 p-2 text-emerald-900">
					{govReport.events.inserted} off day{govReport.events.inserted === 1 ? '' : 's'} added.
				</p>
				<ul class="space-y-0.5 text-gray-700">
					{#each govReport.years as year (year.rocYear)}
						<li>
							ROC {year.rocYear}: holiday cache — {year.cache?.inserted ?? 0} inserted,
							{year.cache?.updated ?? 0} updated.
						</li>
					{/each}
				</ul>
				{#if govReport.events.needsReview.length > 0}
					<p class="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
						Needs a human translation check: {govReport.events.needsReview.join('; ')}.
					</p>
				{/if}
			</div>
		{/if}
	</div>

	<div class="space-y-3">
		<h3 class="text-sm font-semibold text-emerald-900">Or upload the CSV manually</h3>
		<ol class="list-decimal space-y-1 pl-5 text-sm text-gray-700">
			<li>
				Open
				<a
					href="https://data.gov.tw/dataset/14718"
					target="_blank"
					rel="noopener noreferrer"
					class="font-medium text-emerald-800 hover:underline"
				>
					Dataset 14718 (中華民國政府行政機關辦公日曆表)
				</a>
				and download the CSV for the calendar year you need — the file is named like
				<span class="font-medium">115年中華民國政府行政機關辦公日曆表.csv</span>
				(the ROC year is the Gregorian year minus 1911, so 2026 → 115).
			</li>
			<li>Drop that CSV file in the box below (or browse for it).</li>
			<li>Press “Import off days as events” — each named day off becomes an Off event.</li>
		</ol>

		<div
			role="button"
			tabindex="0"
			aria-label="Drag and drop the holiday calendar CSV file"
			data-testid="esl-offday-import.dropzone"
			ondragenter={handleDragEnter}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
			onkeyup={handleKeyUp}
			class={[
				'cursor-pointer rounded-lg border-2 border-dashed text-center transition-colors',
				isDraggingOver ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-300 bg-slate-50'
			]}
		>
			{#if file === null}
				<div class="flex flex-col items-center gap-2 px-4 py-6">
					<Download class="size-6 text-emerald-600" />
					<p class="text-sm text-gray-700">
						Drag and drop the calendar CSV here
						<span class="text-gray-500">— or —</span>
					</p>
					<Button
						size="sm"
						variant="outline"
						onclick={handleBrowseClick}
						data-testid="esl-offday-import.browse"
					>
						Browse…
					</Button>
				</div>
			{:else}
				<div class="flex items-center justify-center gap-2 px-4 py-6">
					<FileText class="size-5 shrink-0 text-emerald-700" />
					<span class="truncate text-sm font-medium text-gray-800" title={file.name}>
						{file.name}
					</span>
					<Button
						size="sm"
						variant="ghost"
						onclick={removeFile}
						aria-label="Remove selected file"
						data-testid="esl-offday-import.remove"
					>
						<X class="size-4" />
					</Button>
				</div>
			{/if}
		</div>
		<input
			bind:this={fileInput}
			id="esl-offday-import-file"
			data-testid="esl-offday-import.file"
			type="file"
			accept=".csv,text/csv"
			onchange={pickFile}
			disabled={importing}
			class="sr-only"
			tabindex="-1"
		/>

		<div class="flex flex-wrap items-center gap-3">
			<Button
				size="sm"
				disabled={!canImport}
				onclick={importOffDays}
				data-testid="esl-offday-import.submit"
			>
				{importing ? 'Importing…' : 'Import off days as events'}
			</Button>
			<p data-testid="esl-offday-import.format-hint" class="text-xs text-gray-500">
				Weekday named days off only — plain weekends and named weekend days carry no event, as do
				dates that already hold one.
			</p>
		</div>

		{#if error}
			<p
				data-testid="esl-offday-import.error"
				class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
			>
				{error}
			</p>
		{/if}
		{#if report}
			<p
				data-testid="esl-offday-import.success"
				class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900"
			>
				{report.inserted} off day{report.inserted === 1 ? '' : 's'} added{report.skippedTaken > 0
					? `, ${report.skippedTaken} already had events and were skipped`
					: ''}{report.outOfRange > 0
					? `, ${report.outOfRange} outside this semester were skipped`
					: ''}{report.plainWeekends > 0
					? `, ${report.plainWeekends} plain weekends skipped`
					: ''}{report.weekendHolidays > 0
					? `, ${report.weekendHolidays} named weekend days skipped`
					: ''}.
			</p>
			{#if report.needsReview.length > 0}
				<p
					data-testid="esl-offday-import.needs-review"
					class="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900"
				>
					Needs a human translation check: {report.needsReview.join('; ')}.
				</p>
			{/if}
		{/if}
	</div>
</section>
