<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import type { GovImportResult, GovPreviewResult, GovPreviewDay } from '$convex/esl/holidays';
	import { Button } from '$lib/components/ui/button';
	import { humanConvexErrorMessage } from '$lib/convex-error';
	import { semesterUploadYears } from '$lib/esl-semesters';

	/**
	 * Inline holiday import for Step 2 of the wizard (tickets #220/#223,
	 * spec #215).
	 *
	 * Saved semesters: auto-selects ROC years via
	 * semesterUploadYears(term, startDate) → previewGovImport → importGovOffDays
	 * → report. Loading spinners during each phase.
	 *
	 * New semesters (`semesterId === 'new'`, the wizard path): the semester
	 * does not exist yet and Cancel must write nothing, so the flow is
	 * preview-only — previewGovImport runs against the draft context
	 * (year/term/startDate) and Import STASHES the previewed days into
	 * wizard state via `onImported` instead of writing events. The Step 5
	 * save transaction writes them as `no_school` events.
	 */

	let {
		semesterId,
		term,
		startDate,
		schoolYear,
		onImported
	}: {
		semesterId: string;
		term: 'S1' | 'S2';
		startDate: string;
		schoolYear?: string | null;
		onImported?: (offDays: { date: string; name: string }[]) => void;
	} = $props();

	const client = useConvexClient();

	/** The wizard path: no semester row exists yet, so nothing may be written. */
	const isNew = $derived(semesterId === 'new');

	type GovYearOption = { rocYear: string; gregorian: string; checked: boolean };

	// Snapshot at mount — the panel remounts when step changes, so options stay fresh.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let govYears = $state<GovYearOption[]>([]);
	let previewing = $state(false);
	let govImporting = $state(false);
	let govError = $state<string | null>(null);
	let govPreview = $state<GovPreviewResult | null>(null);
	let govReport = $state<GovImportResult | null>(null);
	let stagedCount = $state<number | null>(null);

	// Initialize govYears from props - using $effect to capture initial values
	$effect(() => {
		govYears = semesterUploadYears(term, startDate).map((gregorian) => ({
			rocYear: String(Number(gregorian) - 1911),
			gregorian,
			checked: true
		}));
	});

	const pickedYears = $derived(govYears.filter((option) => option.checked).map((o) => o.rocYear));
	const canPreview = $derived(pickedYears.length > 0 && !previewing && !govImporting);
	const canGovImport = $derived(govPreview !== null && !previewing && !govImporting);

	function toggleGovYear(rocYear: string, checked: boolean) {
		const option = govYears.find((o) => o.rocYear === rocYear);
		if (option) option.checked = checked;
		// Changing years clears stale preview/report
		govPreview = null;
		govReport = null;
		govError = null;
		stagedCount = null;
	}

	/** Previewed days minus translation-unverifiable ones, for wizard state. */
	function stageableDays(days: GovPreviewDay[]): { date: string; name: string }[] {
		return days
			.filter((day) => !day.needsReview)
			.map((day) => ({ date: day.date, name: day.name }));
	}

	async function previewGov() {
		if (!canPreview) return;
		previewing = true;
		govError = null;
		govPreview = null;
		govReport = null;
		stagedCount = null;
		try {
			govPreview = isNew
				? await previewDraft()
				: await client.action(api.esl.holidays.previewGovImport, {
						semesterId: semesterId as Id<'esl_semesters'>,
						rocYears: pickedYears
					});
		} catch (cause) {
			govError = humanConvexErrorMessage(cause);
		} finally {
			previewing = false;
		}
	}

	async function previewDraft(): Promise<GovPreviewResult> {
		if (schoolYear == null || schoolYear === '') {
			throw new Error('Pick the semester start date first.');
		}
		return await client.action(api.esl.holidays.previewGovImport, {
			draft: { year: schoolYear, term, startDate },
			rocYears: pickedYears
		});
	}

	async function importGov() {
		if (!canGovImport) return;
		// Wizard path: stash the previewed days into wizard state — the
		// Step 5 save transaction writes the events. No DB writes here.
		if (isNew) {
			const staged = stageableDays(govPreview?.days ?? []);
			stagedCount = staged.length;
			govPreview = null;
			if (onImported) onImported(staged);
			return;
		}
		govImporting = true;
		govError = null;
		govReport = null;
		try {
			govReport = await client.action(api.esl.holidays.importGovOffDays, {
				semesterId: semesterId as Id<'esl_semesters'>,
				rocYears: pickedYears
			});
			// The semester changed underneath the preview — drop it so a
			// second click cannot double-stamp from stale data.
			// Save preview days before clearing govPreview
			const previewDays = govPreview?.days ?? [];
			govPreview = null;

			// Notify parent of imported off days
			if (onImported && govReport) {
				onImported(stageableDays(previewDays));
			}
		} catch (cause) {
			govError = humanConvexErrorMessage(cause);
		} finally {
			govImporting = false;
		}
	}
</script>

<section
	data-testid="wizard.step-2-holiday"
	class="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3"
>
	<h3 class="text-sm font-semibold text-emerald-900">Import holidays from government calendar</h3>
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
					data-testid={`wizard.step-2-holiday.gov-year-${option.rocYear}`}
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
			data-testid="wizard.step-2-holiday.gov-preview"
		>
			{previewing ? 'Reading…' : 'Preview'}
		</Button>
	</div>

	{#if govError}
		<p
			data-testid="wizard.step-2-holiday.gov-error"
			class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
		>
			{govError}
		</p>
	{/if}

	{#if govPreview}
		<div data-testid="wizard.step-2-holiday.gov-preview-result" class="space-y-2 text-sm">
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
				data-testid="wizard.step-2-holiday.gov-import"
			>
				{govImporting ? 'Importing…' : 'Import these off days'}
			</Button>
		</div>
	{/if}

	{#if stagedCount !== null}
		<div data-testid="wizard.step-2-holiday.gov-staged" class="space-y-2 text-sm">
			<p class="rounded border border-emerald-200 bg-emerald-50 p-2 text-emerald-900">
				{stagedCount} off day{stagedCount === 1 ? '' : 's'} staged — written when you save the semester.
			</p>
		</div>
	{/if}

	{#if govReport}
		<div data-testid="wizard.step-2-holiday.gov-report" class="space-y-2 text-sm">
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
</section>
