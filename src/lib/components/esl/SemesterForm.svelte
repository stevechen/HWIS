<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	export type SemesterCreateInput = { year: string; term: 'S1' | 'S2'; startDate: string };

	let {
		busy,
		error,
		onsubmit
	}: {
		busy: boolean;
		error: string | null;
		onsubmit: (input: SemesterCreateInput) => void;
	} = $props();

	let year = $state('');
	let term = $state<'S1' | 'S2'>('S1');
	let startDate = $state('');
</script>

<form
	data-testid="semester-form"
	class="space-y-3 rounded-lg border bg-white p-4"
	onsubmit={(event) => {
		event.preventDefault();
		onsubmit({ year: year.trim(), term, startDate });
	}}
>
	<h2 class="text-base font-semibold text-emerald-900">New semester</h2>
	<p class="text-sm text-gray-600">
		S1 anchors on its start date; S2 can be created any time — no gate on S1's end. The end derives
		later from final-exam events.
	</p>
	<div class="flex flex-wrap gap-3">
		<div class="flex flex-col gap-1">
			<Label for="semester-form-year">School year</Label>
			<input
				id="semester-form-year"
				type="text"
				placeholder="2025-2026"
				bind:value={year}
				disabled={busy}
				class="rounded border px-2 py-1 text-sm"
			/>
		</div>
		<div class="flex flex-col gap-1">
			<Label for="semester-form-term">Term</Label>
			<select
				id="semester-form-term"
				bind:value={term}
				disabled={busy}
				class="rounded border px-2 py-1 text-sm"
			>
				<option value="S1">S1</option>
				<option value="S2">S2</option>
			</select>
		</div>
		<div class="flex flex-col gap-1">
			<Label for="semester-form-start">Start date</Label>
			<input
				id="semester-form-start"
				type="date"
				bind:value={startDate}
				disabled={busy}
				class="rounded border px-2 py-1 text-sm"
			/>
		</div>
	</div>
	{#if error}
		<p
			data-testid="semester-form.error"
			class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
		>
			{error}
		</p>
	{/if}
	<Button type="submit" size="sm" disabled={busy}>Create semester</Button>
</form>
