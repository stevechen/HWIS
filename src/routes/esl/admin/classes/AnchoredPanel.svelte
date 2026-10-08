<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		anchorName,
		trigger = null,
		label,
		testId,
		class: className = '',
		children
	}: {
		/** Whether the panel is showing. Bound, so the trigger can toggle it. */
		open?: boolean;
		/**
		 * The `anchor-name` of the trigger this panel sits against.
		 *
		 * The trigger sets the name itself, inline, because anchor positioning
		 * addresses an element by name rather than by reference — so the two halves
		 * have to agree on a string, and passing it through one prop keeps that
		 * agreement in one place per card.
		 */
		anchorName: string;
		/** The trigger element, so dismissal can hand focus back to it. */
		trigger?: HTMLElement | null;
		/** What the panel is, for assistive tech. */
		label: string;
		testId?: string;
		class?: string;
		children?: Snippet;
	} = $props();

	let panelEl = $state<HTMLDivElement | null>(null);

	/**
	 * Close the panel, returning focus to the trigger if the panel had it.
	 *
	 * Focus has to move *before* the panel leaves the DOM. Removing a focused
	 * element drops focus to `<body>`, which strands keyboard users at the top of
	 * the document — and Save is a path that ends an edit deliberately, so it needs
	 * this as much as Escape does.
	 */
	function close() {
		if (panelEl?.contains(document.activeElement)) trigger?.focus();
		open = false;
	}

	/**
	 * Close when a pointer press or key press lands outside the panel and trigger.
	 *
	 * The panel is out of flow, so nothing about "I clicked away" shows up in the
	 * layout the way an inline expansion would. Listening on `pointerdown` rather
	 * than `click` means the panel is already gone by the time the next element
	 * handles its own click, so a press on another trigger does not land on a
	 * panel that just closed.
	 *
	 * Scoped to `open`, so the listeners exist only while the panel is up.
	 */
	$effect(() => {
		if (!open) return;

		/** Whether the event happened inside the trigger or the panel. */
		function inside(event: Event): boolean {
			const target = event.target;
			if (!(target instanceof Node)) return false;
			return panelEl?.contains(target) === true || trigger?.contains(target) === true;
		}

		function onPointerDown(event: PointerEvent) {
			if (!inside(event)) close();
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape' && !inside(event)) close();
		}

		window.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('keydown', onKeyDown);
		};
	});
</script>

<!--
	The floating surface, shared by every panel so the two editors cannot drift
	apart again.

	No Tailwind utility that resolves ONLY through an `@property`-registered
	`var(--tw-*)` may appear here. Bare `border` and even `border-[1px]` set
	their style via `var(--tw-border-style)`, and every `shadow-*` / `ring-*`
	value — including arbitrary `shadow-[…]`, which gets normalized into the
	`var(--tw-*)` chain — resolves the same way. Where that registration
	lapses, those declarations drop as a set while plain `var(--…)` colors keep
	resolving, which reads as "the border and shadow vanish but the color
	stays". Arbitrary *properties* pass through verbatim, so the edge and its
	shadow are single literal declarations here — the edge in the theme's own
	border color (`--border`, the raw root var, since `@theme inline` emits no
	`--color-*` vars), now that shadows paint again and it no longer has to shout.
-->
<div
	bind:this={panelEl}
	class="anchored-panel bg-popover text-popover-foreground w-80 rounded-md p-2 [box-shadow:0_10px_15px_-3px_#0000001a,0_4px_6px_-4px_#0000001a] [border:1px_solid_var(--border)] {className}"
	style="position-anchor: {anchorName};"
	data-testid={testId}
	role="dialog"
	aria-label={label}
>
	{@render children?.()}
</div>

<style>
	/**
	 * The floating panel, pinned under its trigger with CSS anchor positioning.
	 *
	 * Placement uses `anchor()` on the insets rather than `position-area`:
	 * `position-area` sizes the box from its position *area*, so whenever the
	 * area was shorter than the panel the room grid spilled past the painted
	 * background and rendered on the page behind it, unreadable. `anchor()`
	 * positions without touching the sizing — the box keeps its width and wraps
	 * its content, so it cannot disagree with its own background.
	 *
	 * `fixed` (not `absolute`) so the flip fallbacks measure against the
	 * viewport rather than the trigger's card: the panel is wider than a card,
	 * so against the card every position overflows and no fallback can ever win.
	 * The `relative` wrapper around the trigger is still what the no-anchor
	 * fallback below positions against.
	 *
	 * Out of flow either way, so the card's height is unchanged. Capped against
	 * the viewport in both directions, with inner scroll as the backstop for a
	 * panel taller than the screen.
	 */
	.anchored-panel {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 0;
		/*
		 * Above the sticky site header (z-1000), below blocking modals
		 * (z-9999), so a flipped panel keeps the clicks on whatever it
		 * covers.
		 */
		z-index: 1100;
		max-width: calc(100vw - 2rem);
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
	}

	@supports (anchor-name: --a) {
		.anchored-panel {
			position: fixed;
			top: anchor(bottom);
			left: anchor(left);
			margin-top: 0.5rem;
			position-try-fallbacks: --esl-panel-above, --esl-panel-to-left;
		}
	}

	/*
	 * Flip above the trigger when there is no room below, or align to the
	 * trigger's right edge when there is no room to its right. Only reached
	 * when the base position overflows the viewport; the option has to fit
	 * outright, otherwise the base position stands and the panel scrolls.
	 */
	@position-try --esl-panel-above {
		top: auto;
		bottom: anchor(top);
		margin-top: 0;
		margin-bottom: 0.5rem;
	}
	@position-try --esl-panel-to-left {
		left: auto;
		right: anchor(right);
	}
</style>
