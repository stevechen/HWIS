<!-- ⚠️ PROTOTYPE — Variant B: school-week sections. One dense line per meeting. -->
<script lang="ts">
	import type { DayRow } from './fixture';

	let { days }: { days: DayRow[] } = $props();

	const weeks = $derived(
		Map.groupBy(
			days.filter(
				(d) =>
					d.meetings.length > 0 ||
					d.off ||
					d.noClass.length > 0 ||
					d.exams.length > 0 ||
					d.startSchool
			),
			(d) => d.weekIndex
		)
	);
</script>

<div class="space-y-6">
	{#each [...weeks.entries()] as [week, wdays] (week)}
		<section class="overflow-hidden rounded-lg border bg-white shadow-sm">
			<h2 class="bg-emerald-800 px-4 py-2 text-sm font-bold text-white">School week {week}</h2>
			<table class="w-full text-left text-sm">
				<tbody>
					{#each wdays as day (day.date)}
						{@const examDay = day.exams.length > 0}
						{@const offDay = day.off !== null}
						<tr class="border-t {examDay ? 'bg-red-50' : offDay ? 'bg-stone-100' : ''}">
							<td class="w-28 px-3 py-2 align-top text-xs text-stone-500">
								{day.date.slice(5)}<br />{day.weekdayName.slice(0, 3)}
							</td>
							<td class="px-3 py-2">
								{#if day.startSchool}<div class="text-xs font-bold text-sky-800">
										🏁 {day.startSchool.title}
									</div>{/if}
								{#if day.off}<div class="text-xs font-bold text-stone-700">
										🎉 Off — {day.off.title}
									</div>{/if}
								{#each day.noClass as e (e.id)}
									<div class="text-xs font-bold text-amber-800">No-class — {e.title}</div>
								{/each}
								{#each day.exams as e (e.id)}
									<div class="text-xs font-bold text-red-700">Exam — {e.title}</div>
								{/each}
								{#if day.partial}
									<div class="text-xs font-bold text-violet-800">
										Partial P{day.partial.startPeriod ?? 1}–P{day.partial.endPeriod ?? 8}
									</div>
								{/if}
								<ul class="mt-1 space-y-0.5">
									{#each day.meetings as m (`${m.group}-${m.period}`)}
										<li
											class="text-[13px] {m.status === 'teaching'
												? ''
												: 'text-stone-500 line-through decoration-stone-300'}"
										>
											{m.time.slice(0, 5)} · {m.group} P{m.period} · {m.room}
											{#if m.status !== 'teaching'}<span class="no-underline">
													[{m.status}]</span
												>{/if}
											{#if m.countdown}<span class="text-sky-700"> {m.countdown}</span>{/if}
											{#each m.badges as b (b)}<span class="text-indigo-700"> · {b}</span>{/each}
										</li>
									{/each}
								</ul>
								{#if day.notes.length > 0}
									<p class="mt-0.5 text-xs text-stone-400">{day.notes.join(' · ')}</p>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/each}
</div>
