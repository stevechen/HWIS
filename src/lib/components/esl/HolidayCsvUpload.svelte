<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { decodeHolidayBytes } from '$convex/shared/esl';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { humanConvexErrorMessage } from '$lib/convex-error';

	/**
	 * Official-calendar CSV upload (ticket #207): the dataset-14718 file
	 * for one calendar year lands in the year-keyed `esl_holiday_cache`.
	 * Files arrive as Big5 or UTF-8-BOM; decoding happens here so the
	 * mutation receives plain text. Re-uploads overwrite the year.
	 */

	let { year: initialYear }: { year: string } = $props();

	const client = useConvexClient();

	// Editable draft over the semester-derived default: the parent remounts
	// per semester (`{#key}`), so a null draft always means "the default".
	let draftYear = $state<string | null>(null);
	const year = $derived(draftYear ?? initialYear);
	let file = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	let report = $state<{
		year: string;
		inserted: number;
		updated: number;
		deleted: number;
		days: number;
		holidays: number;
	} | null>(null);

	const canUpload = $derived(file !== null && /^\d{4}$/.test(year.trim()) && !uploading);

	function pickFile(event: Event) {
		const input = event.target as HTMLInputElement;
		file = input.files?.[0] ?? null;
		error = null;
		report = null;
	}

	async function upload() {
		if (file === null || uploading) return;
		const calendarYear = year.trim();
		if (!/^\d{4}$/.test(calendarYear)) {
			error = `${calendarYear} is not a calendar year. Use YYYY.`;
			return;
		}
		uploading = true;
		error = null;
		report = null;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const csvText = decodeHolidayBytes(bytes);
			report = await client.mutation(api.esl.holidays.upload, {
				year: calendarYear,
				csvText
			});
		} catch (cause) {
			error = humanConvexErrorMessage(cause);
		} finally {
			uploading = false;
		}
	}
</script>

<section data-testid="esl-holiday-upload.root" class="space-y-3 rounded-lg border bg-white p-4">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-base font-semibold text-emerald-900">Holiday calendar CSV</h2>
		<a
			href="https://data.gov.tw/dataset/14718"
			target="_blank"
			rel="noopener noreferrer"
			data-testid="esl-holiday-upload.dataset-link"
			class="text-sm font-medium text-emerald-800 hover:underline"
		>
			Dataset 14718
		</a>
	</div>
	<p data-testid="esl-holiday-upload.format-hint" class="text-sm text-gray-600">
		Upload the official calendar CSV for the year above. Headers 西元日期,星期,是否放假,備註; dates
		in YYYYMMDD; 是否放假=2 marks an off day. Re-uploading a year overwrites it.
	</p>

	<div class="flex flex-wrap items-end gap-3">
		<div class="flex flex-col gap-1">
			<Label for="esl-holiday-upload-year">Calendar year</Label>
			<input
				id="esl-holiday-upload-year"
				data-testid="esl-holiday-upload.year"
				inputmode="numeric"
				placeholder="2025"
				value={year}
				oninput={(event) => (draftYear = event.currentTarget.value)}
				disabled={uploading}
				class="w-28 rounded border px-2 py-1 text-sm"
			/>
		</div>
		<div class="flex flex-col gap-1">
			<Label for="esl-holiday-upload-file">Upload calendar CSV</Label>
			<input
				bind:this={fileInput}
				id="esl-holiday-upload-file"
				data-testid="esl-holiday-upload.file"
				type="file"
				accept=".csv,text/csv"
				onchange={pickFile}
				disabled={uploading}
				class="text-sm"
			/>
		</div>
		<Button
			size="sm"
			disabled={!canUpload}
			onclick={upload}
			data-testid="esl-holiday-upload.submit"
		>
			{uploading ? 'Uploading…' : 'Upload calendar CSV'}
		</Button>
	</div>

	{#if error}
		<p
			data-testid="esl-holiday-upload.error"
			class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
		>
			{error}
		</p>
	{/if}
	{#if report}
		<p
			data-testid="esl-holiday-upload.success"
			class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900"
		>
			{report.year}: {report.days} rows ({report.holidays} off) — {report.inserted} inserted,
			{report.updated} updated, {report.deleted} deleted.
		</p>
	{/if}
</section>
