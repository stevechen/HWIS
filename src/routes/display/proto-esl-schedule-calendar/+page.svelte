<script lang="ts">
	// ⚠️ PROTOTYPE — throwaway, do not ship.
	// Question: what should the per-class custom calendar look like? (map #178, ticket #188)
	// Iteration 5: whole-semester scroll keyed by school week (no month splits,
	// so no card renders twice), landing on the current week, Today button,
	// sticky toolbar. Three variants switchable via ?v= + the floating bar.
	// Fixture classes + S1 events, join mocked at the loader level (fixture.ts),
	// no Convex, no writes (notes in-memory).

	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { Ellipsis, MapPin, Users } from '@lucide/svelte';
	import { CLASSES, cardsFor, collapseSummary, nextDate, semesterFragments } from './fixture';
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

	const current: VariantId = $derived(
		VARIANTS.some((v) => v.id === page.url.searchParams.get('v'))
			? (page.url.searchParams.get('v') as VariantId)
			: 'a'
	);
	const currentIndex = $derived(VARIANTS.findIndex((v) => v.id === current));
	let menuOpen = $state(false);

	// Touch the card cache so join errors surface at load, not lazily.
	for (const c of CLASSES) cardsFor(c);

	const fragments = $derived(semesterFragments(cls));
	const collapses = $derived(collapseSummary(cls));
	const next = $derived(nextDate(cls));

	/** Current week: first week with a meeting on or after today (clamped). */
	function currentWeek(): number {
		const hit = fragments.find((f) => f.cards.some((c) => c.date >= todayKey()));
		return (hit ?? fragments[fragments.length - 1])?.weekIndex ?? 0;
	}

	function todayKey(): string {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
	}

	async function scrollToWeek(n: number) {
		await tick();
		document.getElementById(`week-${n}`)?.scrollIntoView({ block: 'start' });
	}

	function setParam(key: string, value: string) {
		const url = new URL(page.url);
		url.searchParams.set(key, value);
		replaceState(`${url.pathname}${url.search}`, {});
	}

	function cycle(delta: 1 | -1) {
		const nextVariant = VARIANTS[(currentIndex + delta + VARIANTS.length) % VARIANTS.length];
		setParam('v', nextVariant.id);
	}

	function onDocClick(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		if (target && target.closest('[data-class-menu]') === null) menuOpen = false;
	}

	function onKey(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (event.key === 'Escape') {
			menuOpen = false;
			return;
		}
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
		window.addEventListener('click', onDocClick);
		scrollToWeek(currentWeek());
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('click', onDocClick);
		};
	});

	const dev = import.meta.env.DEV;
	const stateJson = $derived(
		JSON.stringify(
			{
				class: cls.name,
				scope: 'whole semester, week-keyed rows',
				collapses,
				fragments: fragments.map((f) => ({
					week: f.weekIndex,
					months: f.monthLabel,
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

	<!-- Sticky toolbar: earlier content hides underneath while scrolling. -->
	<div
		class="sticky top-0 z-40 -mx-4 border-b border-emerald-900/10 bg-white/95 px-4 py-2 shadow-sm backdrop-blur sm:-mx-8 sm:px-8"
	>
		<!-- Class switcher: a ••• pull-down button (Apple HIG pattern) opening
			a menu of the teacher's classes, checkmark on the current one. -->
		<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
			<h1
				class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-xl font-bold text-emerald-900"
			>
				<span class="truncate">{cls.short} {cls.type}</span>
				<span class="inline-flex items-center gap-1 font-normal">
					<Users class="size-4 shrink-0" aria-hidden="true" />
					{cls.headcount}
				</span>
				<span class="inline-flex items-center gap-1 font-normal">
					<MapPin class="size-4 shrink-0" aria-hidden="true" />
					{cls.room}
				</span>
			</h1>
			<div class="relative shrink-0" data-class-menu>
				<button
					class="rounded-[12px] border border-stone-300 bg-white p-2 text-stone-600 [corner-shape:squircle] hover:bg-stone-100"
					aria-label="Choose class"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					onclick={() => (menuOpen = !menuOpen)}
				>
					<Ellipsis class="size-5" aria-hidden="true" />
				</button>
				{#if menuOpen}
					<div
						role="menu"
						aria-label="Classes"
						class="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl"
					>
						{#each CLASSES as c (c.id)}
							<button
								role="menuitemradio"
								aria-checked={c.id === cls.id}
								class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-stone-100 {c.id ===
								cls.id
									? 'font-bold text-emerald-900'
									: ''}"
								onclick={() => {
									setParam('c', c.id);
									menuOpen = false;
								}}
							>
								<span class="w-5 shrink-0">{c.id === cls.id ? '✓' : ''}</span>
								{c.short}
								{c.type}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
			<span class="text-muted-foreground text-sm">S1 2026-2027</span>
			<button
				class="ml-auto rounded-full border border-emerald-700 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
				onclick={() => scrollToWeek(currentWeek())}>● Today</button
			>
		</div>
	</div>

	<div class="mt-3">
		{#if current === 'a'}
			<VariantCalA {fragments} {next} />
		{:else if current === 'b'}
			<VariantCalB {fragments} {next} />
		{:else}
			<VariantCalC {fragments} {next} />
		{/if}
	</div>

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
