<script lang="ts">
	import WizardShell from '$lib/components/esl/wizard/WizardShell.svelte';

	/**
	 * Harness for the wizard shell (ticket #218). Stands in for the real step
	 * panels (#219–#223) so the shell's own seams can be driven without any
	 * step content: it writes through the `update()` callback the shell hands
	 * to its children and echoes the state it reads back.
	 */
</script>

<WizardShell>
	{#snippet children({ state, step, update })}
		<span data-testid="harness.step">{step}</span>
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
	{/snippet}
</WizardShell>
