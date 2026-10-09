<!-- ⚠️ PROTOTYPE — Variant C: class-group sections. One column of time per group. -->
<script lang="ts">
	import type { DayRow } from './fixture';

	let { days }: { days: DayRow[] } = $props();

	const groups = ['CLIL-2', 'Comm-1', 'G9-1'] as const;
</script>

<div class="grid gap-4 lg:grid-cols-3">
	{#each groups as group (group)}
		<section class="rounded-lg border bg-white shadow-sm">
			<h2 class="rounded-t-lg bg-emerald-800 px-4 py-2 text-sm font-bold text-white">{group}</h2>
			<ol class="space-y-2 p-3">
				{#each days as day (day.date)}
					{@const mine = day.meetings.filter((m) => m.group === group)}
					{@const offHit = day.off !== null}
					{@const examHit = day.exams.length > 0}
					{@const ncHit = day.noClass.some(
						(e) => e.target === 'all' || e.target === group.slice(0, group.indexOf('-'))
					)}
					{#if mine.length > 0 || offHit || examHit || ncHit}
						<li
							class="rounded border px-2.5 py-1.5 text-[13px] {examHit
								? 'border-red-300 bg-red-50'
								: offHit || ncHit
									? 'border-stone-300 bg-stone-100'
									: 'border-emerald-200'}"
						>
							<div class="flex items-center justify-between gap-2">
								<span class="font-semibold">{day.date.slice(5)} {day.weekdayName.slice(0, 3)}</span>
								{#if offHit}<span>🎉</span>{/if}
							</div>
							{#if offHit}<div class="text-xs font-bold text-stone-600">
									Off — {day.off?.title}
								</div>{/if}
							{#if examHit}<div class="text-xs font-bold text-red-700">Exam</div>{/if}
							{#each day.noClass.filter((e) => e.target === 'all' || e.target === group.slice(0, group.indexOf('-'))) as e (e.id)}
								<div class="text-xs font-bold text-amber-800">No-class — {e.title}</div>
							{/each}
							{#each mine as m (`${m.period}`)}
								<div class={m.status === 'teaching' ? '' : 'text-stone-500'}>
									P{m.period} · {m.time} · {m.room}
									{#if m.status === 'oral'}<span class="font-bold text-orange-800"> Oral</span>{/if}
									{#if m.countdown}<span class="text-sky-700"> {m.countdown}</span>{/if}
								</div>
								{#each m.badges as b (b)}
									<div class="text-xs text-indigo-700">{b}</div>
								{/each}
							{/each}
						</li>
					{/if}
				{/each}
			</ol>
		</section>
	{/each}
</div>
