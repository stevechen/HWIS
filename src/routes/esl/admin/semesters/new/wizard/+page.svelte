<script lang="ts">
	import Step1Panel from '$lib/components/esl/wizard/Step1Panel.svelte';
	import Step2Panel from '$lib/components/esl/wizard/Step2Panel.svelte';
	import Step3Panel from '$lib/components/esl/wizard/Step3Panel.svelte';
	import Step4Panel from '$lib/components/esl/wizard/Step4Panel.svelte';
	import Step5Panel from '$lib/components/esl/wizard/Step5Panel.svelte';
	import WizardShell from '$lib/components/esl/wizard/WizardShell.svelte';

	/**
	 * Semester setup wizard (spec #215) at /esl/admin/semesters/new/wizard.
	 * The route sits under /esl/admin, so `src/routes/esl/admin/+layout.svelte`
	 * is what keeps it admin-only (it mirrors the backend's `requireEslAdmin`).
	 *
	 * Step 1 is built (#219); Step 2 is built (#220); Step 3 is built (#221);
	 * Step 4 is built (#222); Step 5 is built (#223).
	 *
	 * Conventions every step ticket keeps:
	 * - Read the shared state through `state`; change it through `update()`.
	 *   Assigning to `state` directly skips the sessionStorage write.
	 * - `wizard.step-{n}` (the shell's panel wrapper) and `wizard.step-{n}-tab`
	 *   (the stepper tabs) are the shell's test ids — do not reuse them.
	 * - On forward entry into your step, recompute the dates you auto-default
	 *   and keep the ones the admin picked by hand; put a `RecalculateHint`
	 *   next to an overridden field so the computed value is one click away.
	 *   Going back only rewinds the step, so an explicit pick survives.
	 */
</script>

<WizardShell>
	{#snippet children({ state, step, update })}
		{#if step === 1}
			<Step1Panel {state} {update} />
		{:else if step === 2}
			<Step2Panel {state} {step} {update} />
		{:else if step === 3}
			<Step3Panel {state} {update} />
		{:else if step === 4}
			<Step4Panel {state} {update} />
		{:else if step === 5}
			<Step5Panel {state} {update} />
		{/if}
	{/snippet}
</WizardShell>
