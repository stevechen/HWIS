<script lang="ts">
	import Step1Panel from '$lib/components/esl/wizard/Step1Panel.svelte';
	import {
		createInitialWizardState,
		type WizardState
	} from '$lib/components/esl/wizard/wizard-state';

	/**
	 * Harness for wizard Step 1 (ticket #219). Stands in for the wizard shell:
	 * it seeds the real wizard state from a caller-pinned `today`, hands it to
	 * the panel through the same `update()` shape the shell uses, and echoes
	 * the step counter so confirm-advance is observable.
	 */
	let { today = '2026-10-15' }: { today?: string } = $props();

	// Same pattern as WizardShell: $state object mutated directly
	let state = $state<WizardState>(createInitialWizardState(today));

	function update(mutate: (draft: WizardState) => void): void {
		mutate(state);
	}
</script>

<Step1Panel {state} {update} {today} />
<span data-testid="harness.step">{state.currentStep}</span>
<button
	type="button"
	data-testid="harness.clear-start"
	onclick={() =>
		update((draft) => {
			draft.step1.startDate = null;
		})}>Clear start date</button
>
