<script lang="ts">
	// ⚠️ PROTOTYPE — throwaway, do not ship.
	// Question: what should the teacher semester list view look like? (map #178, ticket #182)
	// Three variants switchable via ?v= + the floating bar. Fixture teacher + S1 events,
	// join mocked at the loader level (fixture.ts), no Convex, no writes.
	// Route lives under /display like proto-seasonal-themes so no auth chrome gets in the way.

	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { onMount } from 'svelte';
	import { buildDays, collapseSummary, EVENTS, SEMESTER, TEACHER } from './fixture';
	import VariantAgenda from './VariantAgenda.svelte';
	import VariantWeeks from './VariantWeeks.svelte';
	import VariantGroups from './VariantGroups.svelte';

	const VARIANTS = [
		{ id: 'a', name: 'Day agenda' },
		{ id: 'b', name: 'School weeks' },
		{ id: 'c', name: 'Class groups' }
	] as const;

	type VariantId = (typeof VARIANTS)[number]['id'];

	const days = buildDays();
	const collapses = collapseSummary();

	const current: VariantId = $derived(
		VARIANTS.some((v) => v.id === page.url.searchParams.get('v'))
			? (page.url.searchParams.get('v') as VariantId)
			: 'a'
	);

	const currentIndex = $derived(VARIANTS.findIndex((v) => v.id === current));

	function cycle(delta: 1 | -1) {
		const next = VARIANTS[(currentIndex + delta + VARIANTS.length) % VARIANTS.length];
		replaceState(`?v=${next.id}`, {});
	}

	function onKey(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			return;
		}
		if (event.key === 'ArrowRight') cycle(1);
		if (event.key === 'ArrowLeft') cycle(-1);
	}

	onMount(() => {
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const dev = import.meta.env.DEV;
	const stateJson = $derived(
		JSON.stringify(
			{
				teacher: TEACHER,
				semester: SEMESTER,
				collapses,
				days: days.map((d) => ({
					date: d.date,
					off: d.off?.title ?? null,
					noClass: d.noClass.map((e) => e.title),
					exams: d.exams.map((e) => e.title),
					meetings: d.meetings.map((m) => ({
						group: m.group,
						period: m.period,
						status: m.status,
						countdown: m.countdown,
						badges: m.badges
					}))
				}))
			},
			null,
			1
		)
	);
</script>

<svelte:head>
	<title>PROTOTYPE — ESL schedule list view</title>
</svelte:head>

<div class="mx-auto min-h-screen w-full max-w-6xl p-4 pb-32 sm:p-8">
	<p
		class="rounded-lg border-2 border-dashed border-fuchsia-500 bg-fuchsia-50 px-4 py-2 text-sm font-bold text-fuchsia-900"
	>
		⚠️ PROTOTYPE — throwaway list-view mock for {TEACHER}, {SEMESTER}. Fixture data, no Convex. Flip
		variants below.
	</p>

	<header class="mt-4 mb-4">
		<h1 class="text-2xl font-bold text-emerald-900">{TEACHER} · {SEMESTER}</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			{days.length} days · {EVENTS.length} fixture events · join mocked in fixture.ts
		</p>
	</header>

	{#if current === 'a'}
		<VariantAgenda {days} />
	{:else if current === 'b'}
		<VariantWeeks {days} />
	{:else}
		<VariantGroups {days} />
	{/if}

	<details class="mt-6 rounded-lg border bg-stone-50 p-4 text-xs">
		<summary class="cursor-pointer font-bold"
			>Full computed state (what changed per variant input)</summary
		>
		<pre class="mt-2 overflow-auto">{stateJson}</pre>
	</details>
</div>

{#if dev}
	<nav
		class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-black/80 p-2 pl-4 backdrop-blur-xl"
		aria-label="Prototype variant switcher"
	>
		<button
			class="rounded-full px-3 py-1 text-lg text-white hover:bg-white/15"
			aria-label="Previous variant"
			onclick={() => cycle(-1)}>←</button
		>
		<span class="min-w-40 text-center text-sm font-bold text-white">
			{current.toUpperCase()} ({VARIANTS[currentIndex].name})
		</span>
		<button
			class="rounded-full px-3 py-1 text-lg text-white hover:bg-white/15"
			aria-label="Next variant"
			onclick={() => cycle(1)}>→</button
		>
	</nav>
{/if}
