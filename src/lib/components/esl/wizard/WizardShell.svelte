<script lang="ts">
	import { goto, beforeNavigate } from '$app/navigation';
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
		type WizardMode,
		type WizardState,
		type WizardStepApi,
		type WizardStepNumber,
		type WizardStorage
	} from './wizard-state';
	import type { InferredReport, WizardInferredEntry } from './wizard-load';
	import type { Snippet } from 'svelte';

	let {
		children,
		initialState,
		mode = 'create',
		inferred = { entries: [] }
	}: {
		children: Snippet<[WizardStepApi]>;
		/**
		 * Edit mode (#255) only: the state `loadWizardState` recovered from
		 * the saved semester. The shell clones it, so later edits never leak
		 * back into the caller's object.
		 */
		initialState?: WizardState;
		/** Create keeps the sequential gating and session resume; edit opens everything. */
		mode?: WizardMode;
		/**
		 * Edit mode's inferred report; entries surface inline on the step
		 * they affect (never a blocking modal).
		 */
		inferred?: InferredReport;
	} = $props();

	/** Cancelling returns to the semester list — nothing was written anywhere. */
	const CANCEL_HREF = '/esl/admin/semesters';

	// The stored session is read once, at mount (create mode only). The whole
	// app renders client-only, and `null` keeps the module honest if that
	// ever changes.
	const today = new Date().toISOString().slice(0, 10);
	const storage: WizardStorage | null =
		typeof window === 'undefined' ? null : window.sessionStorage;

	const edit = $derived(mode === 'edit');
	const restored = edit ? null : readWizardState(storage, today);

	// Edit mode mounts from the loaded semester, deep-cloned so the caller's
	// object stays untouched by draft updates. Failing to pass one (a route
	// bug) falls back to session semantics rather than crashing the mount.
	const initialStateClone = initialState === undefined ? undefined : structuredClone(initialState);
	let wizardState = $state<WizardState>(
		restored?.state ?? initialStateClone ?? readWizardState(storage, today).state
	);

	/**
	 * Unsaved marker for the edit-mode guards: the state differs from the
	 * initially loaded one. Serialization is a deep read — the JSON walk
	 * touches every leaf, so any nested edit re-runs the derivations below.
	 */
	const initialSnapshot = serializeWizardState(wizardState);
	/** Set once the edit save lands, so the success redirect is not vetoed. */
	let saved = $state(false);
	const hasUnsaved = $derived(
		edit && !saved && serializeWizardState(wizardState) !== initialSnapshot
	);

	function markSaved(): void {
		saved = true;
	}

	let resumeDismissed = $state(false);
	let lastPersisted = initialSnapshot;

	const step = $derived(wizardState.currentStep);
	const stepDefinition = $derived(WIZARD_STEPS.find((definition) => definition.number === step));
	const stepLabel = $derived(stepDefinition?.label ?? '');
	// Strict forward flow (create only): the current step must hold what the
	// next one needs. Edit mode opens every step of the loaded semester.
	const canAdvance = $derived(isStepComplete(wizardState, step));
	const next = $derived(nextWizardStep(step));

	// ---- Unsaved-changes guards (edit mode): browser `beforeunload` plus an
	// in-app navigation veto. The `beforeNavigate` callback registers once at
	// mount (SvelteKit has no unregister) and re-checks the live
	// `hasUnsaved`/`edit` at navigation time, so dirty/clean cycles never
	// accumulate handlers. `beforeunload` arms only while dirty.
	beforeNavigate((navigation) => {
		if (!edit || !hasUnsaved) return;
		navigation.cancel();
	});
	$effect(() => {
		if (!edit || !hasUnsaved) return;
		const beforeUnload = (event: BeforeUnloadEvent): void => {
			event.preventDefault();
			// Chrome requires returnValue to be set to show the dialog.
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', beforeUnload);
		return () => {
			window.removeEventListener('beforeunload', beforeUnload);
		};
	});

	/** Which step an inferred entry surfaces on; rows that fit no slot stay visible everywhere. */
	function entrySteps(entry: WizardInferredEntry): readonly WizardStepNumber[] {
		const stepMatch = /^step(\d):/.exec(entry.eventKey ?? '');
		if (stepMatch !== null) {
			const stage = WIZARD_STEPS.find(
				(definition) => definition.number === Number(stepMatch[1])
			)?.number;
			if (stage !== undefined) return [stage];
		}
		if ((entry.eventKey ?? '').startsWith('custom:')) return [5];
		return [1, 2, 3, 4, 5];
	}

	// Edit mode never writes sessionStorage — the saved semester in the
	// database is the source of truth until a save lands.
	const visibleInferred = $derived(
		edit ? inferred.entries.filter((entry) => entrySteps(entry).includes(step)) : []
	);

	function persist(): void {
		if (edit) return;
		lastPersisted = serializeWizardState(wizardState);
		writeWizardState(storage, wizardState);
	}

	function update(mutate: (draft: WizardState) => void): void {
		mutate(wizardState);
		persist();
	}

	function stepUnlocked(target: WizardStepNumber): boolean {
		return edit || isStepUnlocked(wizardState, target);
	}

	function goToStep(target: WizardStepNumber): void {
		if (!stepUnlocked(target)) return;
		wizardState.currentStep = target;
		persist();
	}

	function advance(): void {
		// Edit mode opens every step, so Next never waits on completeness.
		if (next === null || (!edit && !canAdvance)) return;
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
		if (!stepUnlocked(target)) return `Complete step ${target} first`;
		return edit ? `Jump to step ${target}` : `Back to step ${target}`;
	}

	// Backstop for a change that reached the state without going through
	// `update()` (create mode only). Serializing is a deep read — the JSON
	// walk touches every leaf, so any nested edit re-runs this effect.
	$effect(() => {
		if (edit) return;
		const payload = serializeWizardState(wizardState);
		if (payload === lastPersisted) return;
		lastPersisted = payload;
		writeWizardState(storage, wizardState);
	});
</script>

<div data-testid="wizard.root" class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 data-testid="wizard.title" class="text-2xl font-bold text-emerald-900">
				{edit ? 'Edit semester' : 'Semester setup'}
			</h1>
			{#if edit}
				<p data-testid="wizard.edit-mode" class="mt-1 text-sm text-emerald-700">
					Editing a saved semester — all steps are open, and saving reconciles with what exists.
				</p>
			{/if}
			<p data-testid="wizard.progress" class="mt-1 text-sm text-gray-600">
				Step {step} of {WIZARD_STEPS.length} — {stepLabel}
			</p>
		</div>
		<Button variant="outline" onclick={cancel} data-testid="wizard.cancel">Cancel</Button>
	</div>

	{#if restored?.resumed && !resumeDismissed}
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

	{#if edit && visibleInferred.length > 0}
		<div
			data-testid="wizard.inferred"
			class="space-y-1 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
		>
			<p class="font-medium">
				Loaded from the saved semester — these details were reconstructed, not stored:
			</p>
			<ul class="list-disc pl-5">
				{#each visibleInferred as entry, index (`${entry.kind}:${entry.id ?? ''}:${index}`)}
					<li data-testid="wizard.inferred-entry">{entry.detail}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<nav aria-label="Setup steps">
		<ol data-testid="wizard.steps" class="flex flex-wrap gap-2 text-sm">
			{#each WIZARD_STEPS as definition (definition.number)}
				{@const unlocked = stepUnlocked(definition.number)}
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
		{@render children({ state: wizardState, step, update, mode, markSaved })}
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
				disabled={!edit && !canAdvance}
				onclick={advance}
				data-testid="wizard.next"
				title={edit || canAdvance ? undefined : `Step ${step} is not complete yet`}
			>
				Next
			</Button>
		{/if}
	</div>
</div>
