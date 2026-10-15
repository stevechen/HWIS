<script lang="ts">
	import Step1Panel from '$lib/components/esl/wizard/Step1Panel.svelte';
	import WizardShell from '$lib/components/esl/wizard/WizardShell.svelte';

	/**
	 * Semester setup wizard (spec #215) at /esl/admin/semesters/new/wizard.
	 * The route sits under /esl/admin, so `src/routes/esl/admin/+layout.svelte`
	 * is what keeps it admin-only (it mirrors the backend's `requireEslAdmin`).
	 *
	 * Step 1 is built (#219); every later panel below is a marked placeholder
	 * for its own ticket, and each of those builds its content as a component
	 * under `$lib/components/esl/wizard/` and swaps it in for the note — the
	 * shell itself needs no change:
	 *
	 *   #220 Step 2 · #221 Step 3 · #222 Step 4 · #223 Step 5
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
			<div data-testid="wizard.step-2-placeholder" class="space-y-2">
				<h2 class="text-sm font-semibold text-gray-800">End date &amp; holidays</h2>
				<p class="text-sm text-gray-500">
					Step 2 arrives with #220 — the end-date rows, the holiday import and the first calendar
					preview.
				</p>
				<p data-testid="wizard.step-2-suggestion" class="text-sm text-gray-700">
					Seeded for you: ends <strong>{state.step2.endDate}</strong>,
					<strong>{state.step2.offDays.length}</strong> imported off days.
				</p>
			</div>
		{:else if step === 3}
			<div data-testid="wizard.step-3-placeholder" class="space-y-2">
				<h2 class="text-sm font-semibold text-gray-800">Exam dates</h2>
				<p class="text-sm text-gray-500">
					Step 3 arrives with #221 — click-to-set exam ranges on the semester calendar.
				</p>
				<p data-testid="wizard.step-3-suggestion" class="text-sm text-gray-700">
					<strong>{state.step3.exams.length}</strong> exam ranges set so far.
				</p>
			</div>
		{:else if step === 4}
			<div data-testid="wizard.step-4-placeholder" class="space-y-2">
				<h2 class="text-sm font-semibold text-gray-800">Events</h2>
				<p class="text-sm text-gray-500">
					Step 4 arrives with #222 — the School and ESL tabs, anchored to the exam periods.
				</p>
			</div>
		{:else}
			<div data-testid="wizard.step-5-placeholder" class="space-y-2">
				<h2 class="text-sm font-semibold text-gray-800">Preview &amp; save</h2>
				<p class="text-sm text-gray-500">
					Step 5 arrives with #223 — the full preview, inline edits and the one-transaction save.
				</p>
			</div>
		{/if}
	{/snippet}
</WizardShell>
