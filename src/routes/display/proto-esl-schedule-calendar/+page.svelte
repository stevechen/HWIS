<script lang="ts">
	// ⚠️ PROTOTYPE — throwaway, do not ship.
	// Question: what should the per-class custom calendar look like? (map #178, ticket #188)
	// Three variants switchable via ?v= + the floating bar. Fixture classes + S1 events,
	// join mocked at the loader level (fixture.ts), no Convex, no writes (notes in-memory).
	// Route lives under /display like proto-esl-schedule-list so no auth chrome gets in the way.

	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { onMount } from 'svelte';
	import { CLASSES, MONTHS, cardsFor, collapseSummary, fragmentsFor } from './fixture';
	import VariantCalA from './VariantCalA.svelte';
	import VariantCalB from './VariantCalB.svelte';
	import VariantCalC from './VariantCalC.svelte';

	const VARIANTS = [
		{ id: 'a', name: 'Roomy cards' },
		{ id: 'b', name: 'Compact lines' },
		{ id: 'c', name: 'Focus week' }
	] as const;

	type VariantId = (typeof VARIANTS)[number]['id'];

	const clsIndex = $derived(
		CLASSES.findIndex((c) => c.id === page.url.searchParams.get('c')) >= 0
			? CLASSES.findIndex((c) => c.id === page.url.searchParams.get('c'))
			: 0
	);
	const cls = $derived(CLASSES[clsIndex]);

	const monthIndex = $derived(() => {
		const raw = Number(page.url.searchParams.get('m') ?? '0');
		if (!Number.isInteger(raw)) return 0;
		return Math.min(Math.max(raw, 0), MONTHS.length - 1);
	});

	const current: VariantId = $derived(
		VARIANTS.some((v) => v.id === page.url.searchParams.get('v'))
			? (page.url.searchParams.get('v') as VariantId)
			: 'a'
	);
	const currentIndex = $derived(VARIANTS.findIndex((v) => v.id === current));

	// Touch the card cache so join errors surface at load, not lazily.
	for (const c of CLASSES) cardsFor(c);

	const fragments = $derived(
		fragmentsFor(cls, MONTHS[monthIndex()].year, MONTHS[monthIndex()].month)
	);
	const collapses = $derived(collapseSummary(cls));

	function setParam(key: string, value: string) {
		const url = new URL(page.url);
		url.searchParams.set(key, value);
		replaceState(`${url.pathname}${url.search}`, {});
	}

	function cycle(delta: 1 | -1) {
		const next = VARIANTS[(currentIndex + delta + VARIANTS.length) % VARIANTS.length];
		setParam('v', next.id);
	}

	function stepMonth(delta: 1 | -1) {
		setParam('m', String(monthIndex() + delta));
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
	const MONTH_NAMES = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];
	const stateJson = $derived(
		JSON.stringify(
			{
				class: cls.name,
				month: `${MONTHS[monthIndex()].year}-${MONTHS[monthIndex()].month}`,
				collapses,
				fragments: fragments.map((f) => ({
					week: f.weekIndex,
					banners: f.banners.map((b) => b.title),
					cards: f.cards.map((c) => ({
						date: c.date,
						period: c.period,
						status: c.status,
						cause: c.cause,
						countdown: c.countdown,
						badges: c.badges
					}))
				}))
			},
			null,
			1
		)
	);
</script>

<svelte:head>
	<title>PROTOTYPE — ESL class calendar</title>
</svelte:head>

<div class="mx-auto min-h-screen w-full max-w-6xl p-4 pb-32 sm:p-8">
	<p
		class="rounded-lg border-2 border-dashed border-fuchsia-500 bg-fuchsia-50 px-4 py-2 text-sm font-bold text-fuchsia-900"
	>
		⚠️ PROTOTYPE — throwaway calendar mock. Fixture data, no Convex, notes not saved. Flip variants
		below.
	</p>

	<header class="mt-4 mb-3">
		<h1 class="text-2xl font-bold text-emerald-900">
			{cls.name} · 👥 {cls.headcount} · {cls.room}
		</h1>
		<p class="text-muted-foreground mt-1 text-sm">S1 2026–2027 · clamped Sept–Oct (S2 separate)</p>
		<div class="mt-2 flex flex-wrap items-center gap-2" role="tablist" aria-label="Classes">
			{#each CLASSES as c, i (c.id)}
				<button
					role="tab"
					aria-selected={i === clsIndex}
					class="rounded-full border px-3 py-1 text-sm font-semibold {i === clsIndex
						? 'border-emerald-700 bg-emerald-700 text-white'
						: 'border-stone-300 bg-white hover:bg-stone-100'}"
					onclick={() => setParam('c', c.id)}
				>
					{c.type} · {c.short}
				</button>
			{/each}
			<span class="mx-1 text-stone-300">|</span>
			<button
				class="rounded-full border border-stone-300 bg-white px-3 py-1 text-sm font-semibold hover:bg-stone-100 disabled:opacity-30"
				disabled={monthIndex() <= 0}
				onclick={() => stepMonth(-1)}>← Prev month</button
			>
			<span class="text-sm font-bold">
				{MONTH_NAMES[MONTHS[monthIndex()].month - 1]}
			</span>
			<button
				class="rounded-full border border-stone-300 bg-white px-3 py-1 text-sm font-semibold hover:bg-stone-100 disabled:opacity-30"
				disabled={monthIndex() >= MONTHS.length - 1}
				onclick={() => stepMonth(1)}>Next month →</button
			>
		</div>
	</header>

	{#if current === 'a'}
		<VariantCalA {fragments} />
	{:else if current === 'b'}
		<VariantCalB {fragments} />
	{:else}
		<VariantCalC {fragments} />
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
