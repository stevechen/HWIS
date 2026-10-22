<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	/**
	 * "Recalculate" affordance for a computed field the admin has overridden
	 * (spec #215: manual overrides are preserved, and every one of them offers
	 * a way back to the computed value).
	 *
	 * Presentational only — the field's owner decides when the override
	 * exists and what recomputing means, so the shell has nothing to say
	 * about it. Steps #219–#222 drop one of these next to any date they
	 * auto-defaulted (Final exam, reminder ranges).
	 */
	let {
		label = 'Recalculate',
		testId = 'wizard.recalculate',
		onRecalculate
	}: {
		label?: string;
		testId?: string;
		onRecalculate: () => void;
	} = $props();
</script>

<span
	data-testid={testId}
	class="inline-flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900"
>
	<span>Manually set</span>
	<Button
		variant="outline"
		size="sm"
		onclick={onRecalculate}
		data-testid={`${testId}-button`}
		title="Recompute the automatic value for this field">{label}</Button
	>
</span>
