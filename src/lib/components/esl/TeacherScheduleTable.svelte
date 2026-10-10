<script lang="ts">
	import { buildScheduleTsv, descriptionText, countdownText } from '$lib/esl-schedule-list';
	import type { ScheduleDayRow } from '$convex/shared/esl';

	let {
		rows,
		classNames,
		eventNotes,
		downloadName
	}: {
		rows: ScheduleDayRow[];
		classNames: Record<string, string>;
		eventNotes: Record<string, string>;
		downloadName: string;
	} = $props();

	const tsv = $derived(buildScheduleTsv(rows, classNames, eventNotes));

	function downloadCsv() {
		const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${downloadName}.tsv`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	async function copyTsv() {
		await navigator.clipboard.writeText(tsv);
	}

	function getRowNote(row: ScheduleDayRow): string {
		const note = row.cause && eventNotes[row.cause];
		return note ?? '';
	}
</script>

<div class="overflow-x-auto rounded-lg border">
	<table class="w-full text-sm">
		<thead class="bg-stone-100">
			<tr>
				<th
					scope="col"
					class="px-3 py-2 text-left font-semibold text-stone-700"
					data-testid="countdown-header">#</th
				>
				<th
					scope="col"
					class="px-3 py-2 text-left font-semibold text-stone-700"
					data-testid="date-header">Date</th
				>
				<th
					scope="col"
					class="px-3 py-2 text-left font-semibold text-stone-700"
					data-testid="description-header">Description</th
				>
				<th
					scope="col"
					class="px-3 py-2 text-left font-semibold text-stone-700"
					data-testid="note-header">Note</th
				>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.date + row.classId + row.period)}
				<tr
					class="border-t {row.status === 'off' || row.status === 'no_class'
						? 'text-gray-400'
						: ''} {row.status === 'exam' ? 'text-red-500' : ''}"
					data-testid="schedule-row"
				>
					<td class="px-3 py-2 font-mono text-stone-600" data-testid="countdown-cell">
						{countdownText(row)}
					</td>
					<td class="px-3 py-2 font-mono text-stone-700" data-testid="date-cell">
						{row.date}
					</td>
					<td class="px-3 py-2" data-testid="description-cell">
						{descriptionText(row, classNames)}
					</td>
					<td class="px-3 py-2 text-stone-500" data-testid="note-cell">
						{getRowNote(row)}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<template data-testid="schedule-tsv">{tsv}</template>

	<div class="mt-4 flex gap-2">
		<button
			data-filename={downloadName}
			class="rounded border px-3 py-1.5 text-sm hover:bg-stone-100"
			onclick={downloadCsv}
		>
			Download schedule as CSV
		</button>
		<button class="rounded border px-3 py-1.5 text-sm hover:bg-stone-100" onclick={copyTsv}>
			Copy schedule
		</button>
	</div>
</div>
