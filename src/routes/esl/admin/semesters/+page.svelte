<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { humanConvexErrorMessage } from '$lib/convex-error';
	import { semesterStatus, semesterSlug } from '$lib/esl-semesters';
	import {
		suggestSemester,
		defaultStartDate,
		schoolYearForTerm,
		startPickerMondays,
		type Term
	} from '$lib/components/esl/wizard/wizard-dates';
	import SemesterStatusChip from '$lib/components/esl/SemesterStatusChip.svelte';
	import WeekPicker from '$lib/components/esl/wizard/WeekPicker.svelte';
	import RecalculateHint from '$lib/components/esl/wizard/RecalculateHint.svelte';
	import { getContext, setContext } from 'svelte';

	const client = useConvexClient();

	const semestersQuery = useQuery(api.esl.semesters.list, () => ({}));
	const semesters = $derived(semestersQuery.data ?? []);

	// Lexical `YYYY-MM-DD` compare, the same rule the backend uses — never a
	// wall-clock read inside a query, and the same string on the client.
	// Use context for test determinism (SvelteKit pages can't accept arbitrary props).
	const TODAY_KEY = 'esl-admin.today';
	const today = $state<string>(
		(getContext(TODAY_KEY) as string | undefined) ?? new Date().toISOString().slice(0, 10)
	);
	setContext(TODAY_KEY, today);

	// Wizard-style term suggestion + date pickers (ticket #230)
	const TERMS: readonly Term[] = ['S1', 'S2'];
	const suggestion = $derived(suggestSemester(today));
	const initialTerm = $derived(suggestion.term);
	const initialSchoolYear = $derived(schoolYearForTerm(initialTerm ?? suggestion.term, today));
	const initialStartDate = $derived(
		defaultStartDate(initialTerm ?? suggestion.term, initialSchoolYear)
	);

	let term = $state<Term | null>(initialTerm);
	let schoolYear = $state<string | null>(initialSchoolYear);
	let startDate = $state<string | null>(initialStartDate);
	const mondays = $derived(
		term === null || schoolYear === null ? [] : startPickerMondays(term, schoolYear)
	);
	const defaultStart = $derived(
		term === null || schoolYear === null ? null : defaultStartDate(term, schoolYear)
	);
	const overridden = $derived(
		startDate !== null && defaultStart !== null && startDate !== defaultStart
	);

	function selectTerm(next: Term) {
		if (next === term) return;
		term = next;
		const year = schoolYearForTerm(next, today);
		schoolYear = year;
		startDate = defaultStartDate(next, year);
	}

	function pickStart(date: string) {
		startDate = date;
	}

	function recalculate() {
		startDate = defaultStart;
	}

	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state('');

	function createSemester(input: { year: string; term: Term; startDate: string }) {
		busy = true;
		error = null;
		client
			.mutation(api.esl.semesters.create, input)
			.then(() => {
				notice = `${input.year} ${input.term} created — add its exam days to pin the end.`;
			})
			.catch((cause: unknown) => {
				error = humanConvexErrorMessage(cause);
			})
			.finally(() => {
				busy = false;
			});
	}
</script>

<div class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<div>
		<h1 data-testid="esl-admin-semesters.title" class="text-2xl font-bold text-emerald-900">
			Semesters
		</h1>
		<p class="text-muted-foreground mt-2">
			S1 anchors on its start date and S2 can be created any time — early planning is never blocked.
			Each semester's end derives from its final-exam events.
		</p>
	</div>

	<!-- Wizard-style create (ticket #230): term toggle + WeekPicker instead of free-text -->
	<section
		data-testid="esl-admin-semesters.create"
		class="space-y-4 rounded-lg border bg-white p-6"
	>
		<div class="flex items-center gap-4">
			<h2 class="text-lg font-semibold text-emerald-900">New semester</h2>
			<a
				href="/esl/admin/semesters/new/wizard"
				class="text-sm font-medium text-emerald-700 hover:underline"
				data-testid="esl-admin-semesters.wizard-link"
			>
				Or use the full setup wizard →
			</a>
		</div>
		<p class="text-sm text-gray-600">
			Pick the term and the week the semester starts. The end date and holidays are set in the
			wizard.
		</p>

		<div class="flex flex-wrap items-center gap-2">
			<span class="text-sm font-medium text-gray-700">Term:</span>
			{#each TERMS as option (option)}
				<button
					type="button"
					onclick={() => selectTerm(option)}
					class="rounded border px-3 py-1.5 text-sm font-medium transition-colors {term === option
						? 'border-emerald-600 bg-emerald-600 text-white'
						: 'border-gray-300 bg-white text-gray-700 hover:border-emerald-400'}"
					data-testid={`esl-admin-semesters.term-${option}`}
				>
					{option}
				</button>
			{/each}
			<span class="text-sm text-gray-600">{schoolYear}</span>
		</div>

		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h3 class="text-sm font-semibold text-gray-800">Pick the week the semester starts</h3>
			<p class="text-sm text-gray-700">
				Start Date: <strong>{startDate ?? '—'}</strong>
			</p>
		</div>

		<WeekPicker
			{mondays}
			selectedDate={startDate}
			snapToMonday
			onPick={pickStart}
			testId="esl-admin-semesters.picker"
		/>

		{#if overridden}
			<RecalculateHint testId="esl-admin-semesters.recalculate" onRecalculate={recalculate} />
		{/if}

		<div class="flex justify-end pt-2">
			<button
				type="button"
				disabled={startDate === null || busy}
				onclick={() => createSemester({ year: schoolYear!, term: term!, startDate: startDate! })}
				class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
				data-testid="esl-admin-semesters.create-btn"
			>
				{busy ? 'Creating…' : 'Create semester'}
			</button>
		</div>
	</section>

	{#if error}
		<p
			data-testid="esl-admin-semesters.error"
			class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800"
		>
			{error}
		</p>
	{/if}

	{#if notice}
		<p
			data-testid="esl-admin-semesters.notice"
			class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
		>
			{notice}
		</p>
	{/if}

	{#if semestersQuery.isLoading}
		<p data-testid="esl-admin-semesters.loading" class="text-muted-foreground py-8 text-center">
			Loading semesters…
		</p>
	{:else if semesters.length === 0}
		<p
			data-testid="esl-admin-semesters.empty"
			class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
		>
			No semesters yet. Create S1 above to anchor the term.
		</p>
	{:else}
		<ul data-testid="esl-admin-semesters.list" class="space-y-2">
			{#each semesters as semester (semester._id)}
				<li class="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4 shadow-sm">
					<a
						href={`/esl/admin/semesters/${semesterSlug(semester)}`}
						data-testid="esl-admin-semesters.row"
						class="text-base font-semibold text-emerald-900 hover:underline"
					>
						{semester.year}
						{semester.term}
					</a>
					<SemesterStatusChip status={semesterStatus(semester, today)} />
					<span class="text-sm text-gray-600">
						Starts {semester.startDate} ·
						{semester.derivedEnd === null ? 'Finals TBD' : `Ends ${semester.derivedEnd}`}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
