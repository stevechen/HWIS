<script lang="ts">
	import type { ScheduleDayRow } from '$convex/shared/esl';
	import {
		buildScheduleTsv,
		countdownText,
		descriptionText,
		noteText
	} from '$lib/esl-schedule-list';

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

	let toastMessage = $state('');
	let showToast = $state(false);
	let toastType = $state<'success' | 'error'>('success');

	function flash(message: string, type: 'success' | 'error'): void {
		toastMessage = message;
		toastType = type;
		showToast = true;
		setTimeout(() => {
			showToast = false;
			toastMessage = '';
		}, 1000);
	}

	async function copyToClipboard(): Promise<void> {
		try {
			await navigator.clipboard.writeText(tsv);
			flash('Copied!', 'success');
		} catch (error) {
			console.error('Failed to copy schedule:', error);
			flash('Failed!', 'error');
		}
	}

	function downloadCsv(): void {
		try {
			const csvContent = tsv.replace(/\t/g, ',');
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
			const link = document.createElement('a');
			if (link.download !== undefined) {
				const url = URL.createObjectURL(blob);
				link.setAttribute('href', url);
				link.setAttribute('download', `${downloadName}.csv`);
				link.style.visibility = 'hidden';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				URL.revokeObjectURL(url);
				flash('Downloaded!', 'success');
			}
		} catch (error) {
			console.error('Failed to download schedule:', error);
			flash('Failed!', 'error');
		}
	}

	function rowTestId(status: ScheduleDayRow['status']): string {
		return `esl-schedule.row-${status}`;
	}
</script>

<div class="relative mb-2 flex items-center gap-2">
	<div class="relative ml-auto flex gap-1">
		<button
			type="button"
			title="Download as CSV"
			aria-label="Download schedule as CSV"
			class="rounded p-1 hover:bg-gray-200"
			onclick={downloadCsv}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="size-5 fill-none stroke-current"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
				/>
			</svg>
		</button>
		<button
			type="button"
			title="Copy to clipboard (for spreadsheet programs)"
			aria-label="Copy schedule to clipboard"
			class="rounded p-1 hover:bg-gray-200"
			onclick={copyToClipboard}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="size-5 fill-none stroke-current"
				viewBox="0 0 24 24"
			>
				<rect class="size-4 fill-white stroke-gray-800 stroke-2" x="6" y="6" rx="2" />
				<rect class="size-4 fill-white stroke-gray-800 stroke-2" x="3" y="3" rx="2" />
			</svg>
		</button>
		{#if showToast}
			<div
				role="status"
				class="absolute top-full left-1/2 z-10 mt-2 flex -translate-x-1/2 items-center gap-2 rounded px-3 py-1 text-sm whitespace-nowrap text-white shadow-lg
					{toastType === 'success' ? 'bg-blue-600' : 'bg-red-500'}"
			>
				{toastMessage}
			</div>
		{/if}
	</div>
</div>

<div class="flex-1 overflow-auto border border-gray-400 font-mono text-xs">
	<table class="w-full border-separate border-spacing-0 text-left text-slate-700">
		<thead>
			<tr class="bg-blue-700 text-white">
				<th class="border border-blue-600 p-2" scope="col">Countdown</th>
				<th class="border border-blue-600 p-2" scope="col">Date</th>
				<th class="border border-blue-600 p-2" scope="col">Day</th>
				<th class="border border-blue-600 p-2" scope="col">Description</th>
				<th class="border border-blue-600 p-2" scope="col">Note</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (`${row.date}-${row.classId}-${row.period}`)}
				{@const greyed = row.status === 'off' || row.status === 'no_class'}
				{@const isExam = row.status === 'exam'}
				<tr
					data-testid="esl-schedule.row"
					class={['border-b border-gray-600', greyed && 'text-gray-400', isExam && 'text-red-500']}
				>
					<td class="border border-gray-200 p-2 whitespace-nowrap">{countdownText(row)}</td>
					<td class="border border-gray-200 p-2 whitespace-nowrap">{row.date}</td>
					<td class="border border-gray-200 p-2 whitespace-nowrap">{row.weekday}</td>
					<td class="w-full border border-gray-200 p-2">
						<span data-testid={rowTestId(row.status)}>{descriptionText(row, classNames)}</span>
						{#each row.badges as badge (badge)}
							<span
								data-testid="esl-schedule.badge"
								class="ml-1 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-700"
								>{badge}</span
							>
						{/each}
					</td>
					<td class="w-full border border-gray-200 p-2 whitespace-nowrap">
						{noteText(row, eventNotes)}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<template data-testid="esl-schedule.tsv">{tsv}</template>
