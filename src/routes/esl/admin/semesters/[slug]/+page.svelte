<script lang="ts">
	import { page } from '$app/state';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { parseSemesterSlug, semesterStatus } from '$lib/esl-semesters';
	import WizardShell from '$lib/components/esl/wizard/WizardShell.svelte';
	import Step1Panel from '$lib/components/esl/wizard/Step1Panel.svelte';
	import Step2Panel from '$lib/components/esl/wizard/Step2Panel.svelte';
	import Step3Panel from '$lib/components/esl/wizard/Step3Panel.svelte';
	import Step4Panel from '$lib/components/esl/wizard/Step4Panel.svelte';
	import Step5Panel from '$lib/components/esl/wizard/Step5Panel.svelte';
	import { loadWizardState } from '$lib/components/esl/wizard/wizard-load';

	/**
	 * Edit wizard at /esl/admin/semesters/[slug] (ticket #255, spec #252).
	 * Replaces the old detail page in place: the slug resolves like it always
	 * did (friendly `YYYY-YYYY-S1` first, raw Convex id fallback), the saved
	 * events fold back into a WizardState via `loadWizardState`, and the
	 * wizard shell hosts the result in edit mode — landed on the Step 5
	 * summary, all steps freely navigable. Checklist status and the holiday
	 * import are #256's move onto the wizard, so they are not here yet.
	 */
	const rawId = $derived(page.params.slug ?? '');
	const parsed = $derived(parseSemesterSlug(rawId));

	const semestersQuery = useQuery(api.esl.semesters.list, () => ({}));
	const semesters = $derived(semestersQuery.data ?? []);
	// Friendly slug first (`2026-2027-S1`), raw Convex id as fallback so
	// old bookmarks, e2e links, and wizard handoffs keep working.
	const selected = $derived(
		(parsed !== null
			? semesters.find((semester) => semester.year === parsed.year && semester.term === parsed.term)
			: semesters.find((semester) => semester._id === rawId)) ?? null
	);
	const semesterId = $derived(selected === null ? null : selected._id);

	const eventsQuery = useQuery(api.esl.events.listBySemester, () =>
		semesterId === null ? 'skip' : { semesterId }
	);
	const events = $derived(eventsQuery.data ?? []);

	// Lexical `YYYY-MM-DD` compare, the same rule the backend uses.
	const today = new Date().toISOString().slice(0, 10);

	const status = $derived(
		selected === null ? ('upcoming' as const) : semesterStatus(selected, today)
	);

	// Loading the wizard state is pure over the semester + its rows; the
	// query results stay untouched because `loadWizardState` reads a
	// structural slice of each row.
	const loaded = $derived.by(() => {
		if (selected === null || eventsQuery.isLoading) return null;
		return loadWizardState(
			{ year: selected.year, term: selected.term, startDate: selected.startDate, id: selected._id },
			events
		);
	});
</script>

<div class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<a
		href="/esl/admin/semesters"
		data-testid="esl-admin-semester-detail.back"
		class="text-sm font-medium text-emerald-800 hover:underline"
	>
		← All semesters
	</a>

	{#if semestersQuery.isLoading || (selected !== null && eventsQuery.isLoading)}
		<p
			data-testid="esl-admin-semester-detail.loading"
			class="text-muted-foreground py-8 text-center"
		>
			Loading semester…
		</p>
	{:else if selected === null || loaded === null}
		<p
			data-testid="esl-admin-semester-detail.missing"
			class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
		>
			Semester not found. It may have been removed — back up to the list and pick another.
		</p>
	{:else}
		{#if status !== 'upcoming'}
			<div
				data-testid="esl-admin-semester-detail.status-warning"
				role="status"
				class="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
			>
				{status === 'current'
					? 'This semester is currently running'
					: 'This semester is already closed'}
				— edits here change what teachers and students see go live on save.
			</div>
		{/if}

		<WizardShell mode="edit" initialState={loaded.state} inferred={loaded.inferred}>
			{#snippet children({ state, step, update, mode, markSaved })}
				{#if step === 1}
					<Step1Panel {state} {update} />
				{:else if step === 2}
					<Step2Panel {state} {step} {update} />
				{:else if step === 3}
					<Step3Panel {state} {update} />
				{:else if step === 4}
					<Step4Panel {state} {update} />
				{:else if step === 5}
					<Step5Panel {state} {update} {mode} {markSaved} />
				{/if}
			{/snippet}
		</WizardShell>
	{/if}
</div>
