<script lang="ts">
	import WizardShell from '$lib/components/esl/wizard/WizardShell.svelte';
	import type { WizardMode, WizardState } from '$lib/components/esl/wizard/wizard-state';
	import type { InferredReport } from '$lib/components/esl/wizard/wizard-load';

	/**
	 * Harness for the wizard shell (ticket #218). Stands in for the real step
	 * panels (#219–#223) so the shell's own seams can be driven without any
	 * step content: it writes through the `update()` callback the shell hands
	 * to its children and echoes the state it reads back.
	 *
	 * The optional props feed the edit mode (ticket #255): a loaded state,
	 * the mode flag, and the inferred report travel straight through, so the
	 * harness can mount the shell the way the `[slug]` route will.
	 */
	let {
		initialState,
		mode,
		inferred
	}: {
		initialState?: WizardState;
		mode?: WizardMode;
		inferred?: InferredReport;
	} = $props();
</script>

<WizardShell {initialState} {mode} {inferred}>
	{#snippet children({ state, step, update, mode: shellMode, markSaved })}
		<span data-testid="harness.step">{step}</span>
		<span data-testid="harness.mode">{shellMode}</span>
		<span data-testid="harness.semester-id">{state.semesterId ?? '—'}</span>
		<span data-testid="harness.start-date">{state.step1.startDate ?? '—'}</span>
		<span data-testid="harness.end-date">{state.step2.endDate ?? '—'}</span>
		<span data-testid="harness.exams">{state.step3.exams.length}</span>
		<button
			type="button"
			data-testid="harness.set-start"
			onclick={() =>
				update((draft) => {
					draft.step1.startDate = '2026-09-07';
				})}>Set start 2026-09-07</button
		>
		<button
			type="button"
			data-testid="harness.clear-end"
			onclick={() =>
				update((draft) => {
					draft.step2.endDate = null;
				})}>Clear end date</button
		>
		<button type="button" data-testid="harness.mark-saved" onclick={markSaved}>Mark saved</button>
	{/snippet}
</WizardShell>
