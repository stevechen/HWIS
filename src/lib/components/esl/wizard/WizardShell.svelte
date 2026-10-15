<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import {
		clearWizardState,
		isStepComplete,
		isStepUnlocked,
		nextWizardStep,
		previousWizardStep,
		readWizardState,
		serializeWizardState,
		WIZARD_STEPS,
		writeWizardState,
		type WizardState,
		type WizardStepApi,
		type WizardStepNumber,
		type WizardStorage
	} from './wizard-state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet<[WizardStepApi]> } = $props();

	/** Cancelling returns to the semester list — nothing was written anywhere. */
	const CANCEL_HREF = '/esl/admin/semesters';

	// The stored session is read once, at mount. The whole app renders
	// client-only, and `null` keeps the module honest if that ever changes.
	const today = new Date().toISOString().slice(0, 10);
	const storage: WizardStorage | null =
		typeof window === 'undefined' ? null : window.sessionStorage;
	const restored = readWizardState(storage, today);

	let wizardState = $state<WizardState>(restored.state);
	let resumeDismissed = $state(false);
	let lastPersisted = serializeWizardState(wizardState);

	const step = $derived(wizardState.currentStep);
	const stepDefinition = $derived(WIZARD_STEPS.find((definition) => definition.number === step));
	const stepLabel = $derived(stepDefinition?.label ?? '');
	// Strict forward flow: the current step must hold what the next one needs.
	const canAdvance = $derived(isStepComplete(wizardState, step));
	const next = $derived(nextWizardStep(step));

	function persist(): void {
		lastPersisted = serializeWizardState(wizardState);
		writeWizardState(storage, wizardState);
	}

	function update(mutate: (draft: WizardState) => void): void {
		mutate(wizardState);
		persist();
	}

	function goToStep(target: WizardStepNumber): void {
		if (!isStepUnlocked(wizardState, target)) return;
		wizardState.currentStep = target;
		persist();
	}

	function advance(): void {
		if (next === null || !canAdvance) return;
		wizardState.currentStep = next;
		persist();
	}

	function back(): void {
		// Going back only rewinds the step — every choice already made stays
		// where it is, so an explicit pick survives a look at an earlier step
		// (the recompute of derived dates belongs to the steps themselves).
		const previous = previousWizardStep(step);
		if (previous === null) return;
		wizardState.currentStep = previous;
		persist();
	}

	function cancel(): void {
		clearWizardState(storage);
		void goto(CANCEL_HREF);
	}

	function tabTitle(target: WizardStepNumber): string {
		if (target === step) return 'Current step';
		if (wizardState.currentStep > target) return `Back to step ${target}`;
		return isStepComplete(wizardState, target)
			? `Jump to step ${target}`
			: `Complete step ${target} first`;
	}

	// Backstop for a change that reached the state without going through
	// `update()`. Serializing is a deep read — the JSON walk touches every
	// leaf, so any nested edit re-runs this effect.
	$effect(() => {
		const payload = serializeWizardState(wizardState);
		if (payload === lastPersisted) return;
		lastPersisted = payload;
		writeWizardState(storage, wizardState);
	});
</script>

<div data-testid="wizard.root" class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 data-testid="wizard.title" class="text-2xl font-bold text-emerald-900">Semester setup</h1>
			<p data-testid="wizard.progress" class="mt-1 text-sm text-gray-600">
				Step {step} of {WIZARD_STEPS.length} — {stepLabel}
			</p>
		</div>
		<Button variant="outline" onclick={cancel} data-testid="wizard.cancel">Cancel</Button>
	</div>

	{#if restored.resumed && !resumeDismissed}
		<div
			data-testid="wizard.resumed"
			class="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
		>
			<span>Resumed the setup you left earlier in this browser session.</span>
			<button
				type="button"
				data-testid="wizard.resumed-dismiss"
				onclick={() => (resumeDismissed = true)}
				class="text-xs font-medium text-emerald-800 underline">Dismiss</button
			>
		</div>
	{/if}

	<nav aria-label="Setup steps">
		<ol data-testid="wizard.steps" class="flex flex-wrap gap-2 text-sm">
			{#each WIZARD_STEPS as definition (definition.number)}
				{@const unlocked = isStepUnlocked(wizardState, definition.number)}
				{@const complete = isStepComplete(wizardState, definition.number)}
				{@const current = definition.number === step}
				<li>
					<button
						type="button"
						data-testid={`wizard.step-${definition.number}-tab`}
						data-complete={complete ? 'true' : 'false'}
						aria-current={current ? 'step' : undefined}
						disabled={!unlocked}
						title={tabTitle(definition.number)}
						onclick={() => goToStep(definition.number)}
						class="rounded-full px-3 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-60 {current
							? 'bg-emerald-700 text-white'
							: complete
								? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
								: 'bg-gray-100 text-gray-500'}"
					>
						{definition.number}. {definition.label}{complete ? ' ✓' : ''}
					</button>
				</li>
			{/each}
		</ol>
	</nav>

	<section data-testid={`wizard.step-${step}`} class="space-y-4 rounded-lg border bg-white p-4">
		{@render children({ state: wizardState, step, update })}
	</section>

	<div class="flex items-center justify-between gap-2">
		<Button variant="outline" disabled={step === 1} onclick={back} data-testid="wizard.back">
			Back
		</Button>
		{#if step === 5}
			<!-- Save button is rendered by Step5Panel; shell only shows Back on the last step. -->
			<div data-testid="wizard.step-5-footer-spacer" aria-hidden="true" />
		{:else}
			<Button
				disabled={!canAdvance}
				onclick={advance}
				data-testid="wizard.next"
				title={canAdvance ? undefined : `Step ${step} is not complete yet`}
			>
				Next
			</Button>
		{/if}
	</div>
</div>
