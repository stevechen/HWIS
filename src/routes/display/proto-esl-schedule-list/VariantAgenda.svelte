<!-- ⚠️ PROTOTYPE — Variant A: chronological day agenda. Date-grouped sections. -->
<script lang="ts">
	import type { DayRow } from './fixture';

	let { days }: { days: DayRow[] } = $props();

	function chip(status: string): string {
		switch (status) {
			case 'off':
				return 'bg-stone-700 text-white';
			case 'no_class':
				return 'bg-amber-200 text-amber-900';
			case 'exam':
				return 'bg-red-600 text-white';
			case 'oral':
				return 'bg-orange-100 text-orange-900';
			default:
				return 'bg-emerald-100 text-emerald-900';
		}
	}

	function label(status: string): string {
		switch (status) {
			case 'off':
				return '🎉 Off';
			case 'no_class':
				return 'No-class';
			case 'exam':
				return 'Exam';
			case 'oral':
				return 'Oral Exam';
			default:
				return 'Teaching';
		}
	}
</script>

<div class="space-y-4">
	{#each days.filter((d) => d.meetings.length > 0 || d.off || d.noClass.length > 0 || d.exams.length > 0 || d.startSchool) as day (day.date)}
		{@const grey =
			day.off !== null ||
			(day.noClass.length > 0 && day.meetings.every((m) => m.status === 'no_class'))}
		<section
			class="rounded-lg border bg-white p-4 shadow-sm {grey ? 'bg-stone-100 opacity-90' : ''}"
		>
			<header class="flex flex-wrap items-center gap-2">
				<h2 class="font-semibold">{day.date} · {day.weekdayName}</h2>
				{#if day.off}
					<span class="rounded px-2 py-0.5 text-xs font-bold {chip('off')}"
						>{label('off')} — {day.off.title}</span
					>
				{/if}
				{#each day.noClass as e (e.id)}
					<span class="rounded px-2 py-0.5 text-xs font-bold {chip('no_class')}"
						>{label('no_class')} — {e.title}</span
					>
				{/each}
				{#each day.exams as e (e.id)}
					<span class="rounded px-2 py-0.5 text-xs font-bold {chip('exam')}"
						>{label('exam')} — {e.title}</span
					>
				{/each}
				{#if day.startSchool}
					<span class="rounded bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900"
						>🏁 {day.startSchool.title}</span
					>
				{/if}
				{#if day.partial}
					<span class="rounded bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-900">
						Partial P{day.partial.startPeriod ?? 1}–P{day.partial.endPeriod ?? 8} — {day.partial
							.title}
					</span>
				{/if}
			</header>
			<ul class="mt-2 space-y-1.5">
				{#each day.meetings as m (`${m.group}-${m.period}`)}
					<li
						class="flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-sm {m.status ===
						'exam'
							? 'border-red-300 bg-red-50'
							: m.status === 'teaching'
								? 'border-emerald-200'
								: 'border-stone-300 bg-stone-50'}"
					>
						<span class="font-semibold">{m.group}</span>
						<span class="text-stone-500">P{m.period} · {m.time} · {m.room}</span>
						<span class="rounded px-1.5 py-0.5 text-xs font-bold {chip(m.status)}"
							>{label(m.status)}</span
						>
						{#if m.countdown}
							<span class="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800"
								>{m.countdown} to Exam</span
							>
						{/if}
						{#each m.badges as b (b)}
							<span class="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-800">{b}</span>
						{/each}
					</li>
				{/each}
			</ul>
			{#if day.notes.length > 0}
				<p class="mt-2 text-xs text-stone-500">{day.notes.join(' · ')}</p>
			{/if}
		</section>
	{/each}
</div>
