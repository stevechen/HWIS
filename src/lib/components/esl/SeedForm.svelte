<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	/**
	 * The seed mutation's date knobs, minus `semesterId`: exam starts grow
	 * their weekday ends (`start + N−1` weekdays), weekend off-days suggest a
	 * Friday-before makeup, and the lunar date resolves from the holiday cache
	 * or falls back to the admin-typed (flagged) date. Groups left blank are
	 * simply not seeded — admins add dues and mocks through the event form.
	 */
	export type SeedFormInput = {
		examStarts?: { exam1?: string; exam2?: string; final?: string };
		bbqDate?: string;
		sportsDayDate?: string;
		ceremonyDate?: string;
		springBreakStart?: string;
		springBreakEnd?: string;
		anniversaryDate?: string;
		moonFestivalDate?: string;
		dragonBoatDate?: string;
	};

	export type SeedFormReport = {
		createdCount: number;
		makeup: { forDate: string; makeupDate: string; label: string }[];
		makeupSkipped: string[];
		unresolvedLunar: string[];
	};

	let {
		term,
		busy,
		error,
		report,
		onseed
	}: {
		term: 'S1' | 'S2';
		busy: boolean;
		error: string | null;
		report: SeedFormReport | null;
		onseed: (input: SeedFormInput) => void;
	} = $props();

	let exam1 = $state('');
	let exam2 = $state('');
	let final = $state('');
	let bbq = $state('');
	let sports = $state('');
	let ceremony = $state('');
	let breakStart = $state('');
	let breakEnd = $state('');
	let anniversary = $state('');
	let lunar = $state('');

	function optional(value: string): string | undefined {
		const trimmed = value.trim();
		return trimmed === '' ? undefined : trimmed;
	}
</script>

<form
	data-testid="seed-form"
	class="space-y-3 rounded-lg border bg-white p-4"
	onsubmit={(event) => {
		event.preventDefault();
		const examStarts = {
			...(optional(exam1) === undefined ? {} : { exam1: optional(exam1) as string }),
			...(optional(exam2) === undefined ? {} : { exam2: optional(exam2) as string }),
			...(optional(final) === undefined ? {} : { final: optional(final) as string })
		};
		onseed({
			...(Object.keys(examStarts).length === 0 ? {} : { examStarts }),
			...(optional(bbq) === undefined ? {} : { bbqDate: optional(bbq) as string }),
			...(optional(sports) === undefined ? {} : { sportsDayDate: optional(sports) as string }),
			...(optional(ceremony) === undefined ? {} : { ceremonyDate: optional(ceremony) as string }),
			...(optional(breakStart) === undefined
				? {}
				: { springBreakStart: optional(breakStart) as string }),
			...(optional(breakEnd) === undefined ? {} : { springBreakEnd: optional(breakEnd) as string }),
			...(optional(anniversary) === undefined
				? {}
				: { anniversaryDate: optional(anniversary) as string }),
			...(term === 'S1'
				? optional(lunar) === undefined
					? {}
					: { moonFestivalDate: optional(lunar) as string }
				: optional(lunar) === undefined
					? {}
					: { dragonBoatDate: optional(lunar) as string })
		});
	}}
>
	<h2 class="text-base font-semibold text-emerald-900">Seed drafts</h2>
	<p class="text-sm text-gray-600">
		One seed per semester, while it is still empty. Exam ends are computed (start + weekdays);
		weekend off-days suggest a Friday-before makeup. Leave a group blank to skip it.
	</p>

	<fieldset class="flex flex-wrap gap-3">
		<legend class="text-sm font-medium">Exam starts</legend>
		<div class="flex flex-col gap-1">
			<Label for="seed-form-exam1">Exam 1 starts</Label>
			<input
				id="seed-form-exam1"
				type="date"
				bind:value={exam1}
				disabled={busy}
				class="rounded border px-2 py-1 text-sm"
			/>
		</div>
		<div class="flex flex-col gap-1">
			<Label for="seed-form-exam2">Exam 2 starts</Label>
			<input
				id="seed-form-exam2"
				type="date"
				bind:value={exam2}
				disabled={busy}
				class="rounded border px-2 py-1 text-sm"
			/>
		</div>
		<div class="flex flex-col gap-1">
			<Label for="seed-form-final">Final exam starts</Label>
			<input
				id="seed-form-final"
				type="date"
				bind:value={final}
				disabled={busy}
				class="rounded border px-2 py-1 text-sm"
			/>
		</div>
	</fieldset>

	{#if term === 'S1'}
		<fieldset class="flex flex-wrap gap-3">
			<legend class="text-sm font-medium">Fall anchors</legend>
			<div class="flex flex-col gap-1">
				<Label for="seed-form-bbq">BBQ date</Label>
				<input
					id="seed-form-bbq"
					type="date"
					bind:value={bbq}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<Label for="seed-form-sports">Sport's Day date</Label>
				<input
					id="seed-form-sports"
					type="date"
					bind:value={sports}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<Label for="seed-form-lunar">Moon Festival date</Label>
				<input
					id="seed-form-lunar"
					type="date"
					bind:value={lunar}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
			</div>
		</fieldset>
	{:else}
		<fieldset class="flex flex-wrap gap-3">
			<legend class="text-sm font-medium">Spring anchors</legend>
			<div class="flex flex-col gap-1">
				<Label for="seed-form-ceremony">Graduation ceremony date</Label>
				<input
					id="seed-form-ceremony"
					type="date"
					bind:value={ceremony}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<Label for="seed-form-break-start">Spring break starts</Label>
				<input
					id="seed-form-break-start"
					type="date"
					bind:value={breakStart}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<Label for="seed-form-break-end">Spring break ends</Label>
				<input
					id="seed-form-break-end"
					type="date"
					bind:value={breakEnd}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<Label for="seed-form-anniversary">Anniversary date</Label>
				<input
					id="seed-form-anniversary"
					type="date"
					bind:value={anniversary}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<Label for="seed-form-lunar">Dragon Boat Festival date</Label>
				<input
					id="seed-form-lunar"
					type="date"
					bind:value={lunar}
					disabled={busy}
					class="rounded border px-2 py-1 text-sm"
				/>
			</div>
		</fieldset>
	{/if}
	<p class="text-xs text-gray-500">
		An explicit festival date is stored admin-typed and flagged unverified; leave it blank to
		resolve from the holiday cache instead.
	</p>

	{#if error}
		<p
			data-testid="seed-form.error"
			class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
		>
			{error}
		</p>
	{/if}
	{#if report}
		<div
			data-testid="seed-form.report"
			class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900"
		>
			<p>Seeded {report.createdCount} draft rows — fill or delete them below.</p>
			{#each report.makeup as row (row.makeupDate)}
				<p>Makeup for {row.label} on {row.forDate}: {row.makeupDate} (editable).</p>
			{/each}
			{#each report.makeupSkipped as skipped (skipped)}
				<p>{skipped}</p>
			{/each}
			{#each report.unresolvedLunar as festival (festival)}
				<p>{festival} could not be resolved from the holiday cache — enter its date by hand.</p>
			{/each}
		</div>
	{/if}

	<Button type="submit" size="sm" disabled={busy}>Seed drafts</Button>
</form>
