# Research: Svelte Component Decomposition — When to Split vs. Keep Together

**Date:** 2026-08-03
**Question:** Is it best practice to break up a Svelte component into very small chunks — including separate components for empty state, error state, loading state, etc. — or should related UI states live inside the parent component?

---

## Summary / Answer

**The official Svelte resources recommend a middle ground: decompose by responsibility and reusability, not by UI state.** Loading, empty, and error states should generally live _inside_ the parent component using `{#if}`, `{#await}`, `{#snippet}`, or `<svelte:boundary>` — unless those states are reused across multiple components, in which case they become candidates for extraction.

The key principle is **single responsibility applied pragmatically**: a component should do "one thing," but "one thing" is defined by _cognitive load and reusability_, not line count. Rich Harris and the Svelte docs never recommend micro-extracting every conditional branch into its own component file. Instead, the Svelte 5 approach uses **snippets** for reusable markup chunks within a component, **`<svelte:boundary>`** for loading/error isolation, and **`{#if}`/`{#await}`** blocks for inline state handling.

---

## Detailed Findings by Source

### 1. Official Svelte Docs — Best Practices

The Svelte best practices page (`svelte.dev/docs/svelte/best-practices`) does **not** mention component splitting or decomposition at all. It focuses on:

- Using `$state` only for reactive variables
- Using `$derived` over `$effect`
- Using keyed `{#each}` blocks
- Using snippets over slots
- Avoiding legacy features

This silence is itself informative: the Svelte team does not consider "how small to make components" a best-practice issue — it considers it an engineering judgment call.

**Source:** https://svelte.dev/docs/svelte/best-practices

### 2. Official Svelte Docs — Snippets (Composition Primitive)

The Svelte 5 snippets documentation (`svelte.dev/docs/svelte/snippet`) shows the recommended pattern for handling repeated or conditional UI fragments **within a single component** — without extracting to separate files:

> "Snippets, and render tags, are a way to create reusable chunks of markup inside your components."

The docs show a `DataTable` example where the empty state is handled **inline** with an `{#if}` block, not as a separate component:

```svelte
{#if data.length === 0}
	{#if empty}
		{@render empty()}
	{:else}
		<p>No data to display.</p>
	{/if}
{/if}
```

The `empty` snippet is an **optional prop** on the component — the consumer can override it if needed, but the default lives inline. This is the Svelte-endorsed pattern: handle states inline by default, make them overridable via snippet props.

**Source:** https://svelte.dev/docs/svelte/snippet

### 3. Official Svelte Docs — `<svelte:boundary>` (Error/Loading Isolation)

The `<svelte:boundary>` element (added in Svelte 5.3.0, documented at `svelte.dev/docs/svelte/svelte-boundary`) is the **first-class mechanism** for isolating loading and error states **within** a parent component:

```svelte
<svelte:boundary>
	<FlakyComponent />

	{#snippet pending()}
		<p>loading...</p>
	{/snippet}

	{#snippet failed(error, reset)}
		<button onclick={reset}>oops! try again</button>
	{/snippet}
</svelte:boundary>
```

Key points from the docs:

- The `pending` snippet shows when the boundary is first created and async expressions are resolving
- The `failed` snippet renders when an error occurs during rendering
- This approach keeps error/loading UI **co-located** with the component it wraps — no separate files needed

This is the **strongest official signal** that Svelte intends loading/error/empty states to live alongside the parent, not in separate component files.

**Source:** https://svelte.dev/docs/svelte/svelte-boundary

### 4. SvelteKit Docs — Error Handling

SvelteKit provides error handling at the **route level** via `+error.svelte` files (`kit.svelte.dev/docs/kit/errors`), not at the component level:

> "If an error occurs inside a load function while rendering a page, SvelteKit will render the +error.svelte component nearest to where the error occurred."

This is a route/page-level concern. For component-level errors, the SvelteKit docs reference `<svelte:boundary>` as the mechanism. The docs do not recommend extracting error states into separate components.

**Source:** https://kit.svelte.dev/docs/kit/errors

### 5. Rich Harris — On Component Granularity

In the Svelte GitHub issue #2546 ("Yes but does it scale?"), Rich Harris addresses the cost of many small components:

> "The incremental cost of Svelte components isn't that high. The code is designed to be readable, but also to minify really well, and it makes use of a shared internal library."

He also notes (in issue #15116, "A more holistic compilation process"):

> "One important thing about component-based development is that the individual components can be any size; some can basically be your entire app, and some can just be a single styled element for reusability."

However, Rich Harris **closes** the issue about optimizing tiny components, explaining that even a small compiled Svelte component (~466 bytes) is already smaller than equivalent vanilla JS (~468 bytes) when including state management, event delegation, and scheduling:

> "Yes, the second example imports functions — $.set, $.get, $.template and so on. But these are functions that are already used in every single Svelte app, so you don't pay anything extra for them."

The implication: small components are fine when they serve a reusability purpose, but don't extract _just_ to reduce line count — the compiler is already optimized.

**Sources:**

- https://github.com/sveltejs/svelte/issues/2546
- https://github.com/sveltejs/svelte/issues/15116

### 6. Rich Harris — On Small Modules (General Philosophy)

In a 2015 essay, Rich Harris argued against the "small modules" dogma:

> "I think I know why: it's because the small modules philosophy favours library authors (like Sindre) at the ultimate expense of library users."

While this was about npm packages (not Svelte components), it reveals Harris's general stance: **don't decompose for the sake of decomposition**. The overhead of managing many tiny units falls on the consumer. This philosophy extends to component design.

**Source:** https://medium.com/@Rich_Harris/small-modules-it-s-not-quite-that-simple-3ca532d65de4

### 7. MDN Svelte Tutorial — Componentizing

The MDN tutorial on componentizing a Svelte app (`developer.mozilla.org/en-US/docs/Learn_web_development/Core/Frameworks_libraries/Svelte_components`) provides the most explicit guidance on when to split:

> "There are no hard rules for this. Some people prefer an intuitive approach and start looking at the markup and drawing boxes around every component and subcomponent that seems to have its own logic."
>
> "Other people apply the same techniques used for deciding if you should create a new function or object. One such technique is the single responsibility principle — that is, a component should ideally only do one thing. If it ends up growing, it should be split into smaller subcomponents."

The tutorial then demonstrates splitting a TodoMVC app into ~6 components: `Alert`, `NewTodo`, `FilterButton`, `TodosStatus`, `Todo`, and `MoreActions`. Notably, each represents a **distinct interaction concern** (filtering, status display, individual items, bulk actions), not different _states_ of the same data.

**Source:** https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Frameworks_libraries/Svelte_components

### 8. Community Discussion — Reddit r/sveltejs

A Reddit thread ("How do you stop overthinking component/page size/splitting?") captures the community consensus well:

> "In my experience, lines of code can offer some guidance but they don't reliably indicate when code needs to be refactored or split. What really matters is the cognitive load, how much mental effort it takes to understand the code. For example, a 300-line component focused on one clear task can be easier to work with than a 100-line component that tries to handle three different things."

> "Don't over complicate things. You can always come back and refine. Forward momentum in the project is very important."

> "I make components to isolate logic and/or make something reusable. Snippets make it a little easier to isolate logic without having to create a whole new [file]."

**Source:** https://www.reddit.com/r/sveltejs/comments/1l39040/

### 9. Svelte Community — GitHub Issues on Multiple Components Per File

GitHub issues #1031 and #2940 discuss supporting multiple components in a single file. Rich Harris's position (via Gitter, referenced in the issues) was that snippets solve this use case. In Svelte 5, snippets allow you to define reusable markup fragments _within_ a component without creating separate files.

One commenter in issue #2940 eventually reversed their position:

> "Ok, after working with svelte for a while I'm _officially_ reversing my opinion on this. Components are better off in a SINGLE file... Single file components advantages: Easier to maintain, Easier to reuse and copy, Easier to determine dependencies, Encourage simpler components."

**Sources:**

- https://github.com/sveltejs/svelte/issues/1031
- https://github.com/sveltejs/svelte/issues/2940

### 10. Community Patterns — Guard Components

A community pattern for async data states uses a "Guard" component with snippet parameters for type safety. The pattern handles `undefined` (loading), `null` (not found), and resolved data states in one component:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import type { Article } from '$lib/types/article';

	interface Props {
		article: Article | undefined | null;
		content: Snippet<[Article]>;
	}

	let { article, content }: Props = $props();
</script>

{#if article === undefined}
	<Spinner>Loading...</Spinner>
{:else if article === null}
	<p>Not found.</p>
{:else}
	{@render content(article)}
{/if}
```

This is a reusable _component_ (not just a snippet) because it has its own type-scoped behavior. It's extracted because it's reused across the app — not because the states are separate concerns.

**Source:** https://daviddalbusco.medium.com/better-type-safety-in-svelte-guard-components-f3d69063a58f

---

## Tradeoffs Analysis

### Performance

- **Small components have minimal cost in Svelte.** Rich Harris confirmed in issue #2546 that Svelte components are highly optimized: compiled output shares internal functions (`$.set`, `$.get`, `$.template`) across the entire app. A component compiled from ~50 lines of source is ~466 bytes.
- **But unnecessary components add overhead.** Each component introduces its own import, function wrapper, and lifecycle hooks. For components that are only used in one place and add no reusability, this overhead is pure waste.
- **The crossover point** (where Svelte bundles exceed equivalent vanilla JS) is at ~120KB of component source code ([investigation by halfnelson](https://github.com/halfnelson/svelte-it-will-scale)). Most apps won't hit this.

### Readability & Maintainability

- **Inline state handling (`{#if}`, `{#await}`, `{#snippet}`) keeps related logic together.** When loading/error/success states are in the same file, the full state machine is visible in one place.
- **Extracting to separate files scatters the state machine.** A developer must open multiple files to understand how a single piece of UI behaves.
- **But extraction helps when the logic is genuinely complex** (e.g., a form with validation, error recovery, and retry logic that's used in 3+ places).

### Bundle Size

- **Minimal difference for most apps.** Svelte's compiler inlines shared code. Tiny components (~10-20 lines) don't meaningfully increase bundle size because the shared runtime (`svelte/internal`) is already loaded.
- **Code splitting matters more.** SvelteKit automatically code-splits by route. Extracting a component into a separate file doesn't make it lazy-loaded unless you use dynamic `import()`.

### Reusability

- **The strongest reason to extract.** If loading/error states need different UI in different contexts (e.g., a table loading state vs. a card loading state), snippets passed as props solve this without separate component files.
- **If a state pattern appears in 2+ places**, extract it as a reusable component. This follows the general rule: first use is inline, second use triggers extraction.

---

## Recommendation

### Do This (Default)

1. **Handle loading/empty/error states inline** using `{#if}`, `{#await}`, and `{#snippet}`:

   ```svelte
   {#await data}
   	<p>Loading...</p>
   {:then items}
   	{#if items.length === 0}
   		<p>No items found.</p>
   	{:else}
   		{#each items as item}
   			<Item {item} />
   		{/each}
   	{/if}
   {:catch error}
   	<p>Error: {error.message}</p>
   {/await}
   ```

2. **Use `<svelte:boundary>` for error/loading isolation** when wrapping async components:

   ```svelte
   <svelte:boundary>
   	<AsyncWidget />
   	{#snippet pending()}<Spinner />{/snippet}
   	{#snippet failed(err, reset)}
   		<button onclick={reset}>Retry</button>
   	{/snippet}
   </svelte:boundary>
   ```

3. **Use snippet props for overridable state UI** on reusable components:

   ```svelte
   <!-- DataTable.svelte -->
   let { data, empty, loading } = $props();

   {#if loading}
     {@render loading?.()}
   {:else if data.length === 0}
     {@render empty?.() ?? <p>No data</p>}
   {:else}
     <!-- render table -->
   {/if}
   ```

### Extract When

- A state pattern is **reused in 3+ places** with different visual treatments
- The state handling logic is **genuinely complex** (multi-step validation, retry logic, optimistic updates) and would make the parent unreadable
- The extracted component has its **own state or effects** (snippets are stateless — if you need `$state` inside it, it should be a component)
- The extracted unit is **testable in isolation** (e.g., a form component with validation)

### Don't Extract When

- The state is only used in one place
- The extraction would just be `{#if}<Component />{:else}<OtherComponent />{/if}` — that's what `{#if}` is for
- You're extracting to reduce line count of the parent but the parent still owns all the logic
- The extracted component would have no props, no effects, and no reusability — it's just a `<div>` with different content

---

## References

| Source                                            | URL                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Svelte Best Practices                             | https://svelte.dev/docs/svelte/best-practices                                                              |
| Svelte Snippets                                   | https://svelte.dev/docs/svelte/snippet                                                                     |
| Svelte `<svelte:boundary>`                        | https://svelte.dev/docs/svelte/svelte-boundary                                                             |
| Svelte `{#if}`                                    | https://svelte.dev/docs/svelte/if                                                                          |
| Svelte `{#await}`                                 | https://svelte.dev/docs/svelte/await                                                                       |
| Svelte `.svelte` files                            | https://svelte.dev/docs/svelte/svelte-files                                                                |
| SvelteKit Errors                                  | https://kit.svelte.dev/docs/kit/errors                                                                     |
| SvelteKit Performance                             | https://kit.svelte.dev/docs/kit/performance                                                                |
| MDN: Componentizing Svelte                        | https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Frameworks_libraries/Svelte_components |
| Rich Harris — "Small Modules"                     | https://medium.com/@Rich_Harris/small-modules-it-s-not-quite-that-simple-3ca532d65de4                      |
| Svelte Issue #2546 — Scalability                  | https://github.com/sveltejs/svelte/issues/2546                                                             |
| Svelte Issue #15116 — Holistic Compilation        | https://github.com/sveltejs/svelte/issues/15116                                                            |
| Svelte Issue #1031 — Components in One File       | https://github.com/sveltejs/svelte/issues/1031                                                             |
| Svelte Issue #2940 — Multiple Components Per File | https://github.com/sveltejs/svelte/issues/2940                                                             |
| Reddit — Overthinking Component Size              | https://www.reddit.com/r/sveltejs/comments/1l39040/                                                        |
| Guard Components Pattern                          | https://daviddalbusco.medium.com/better-type-safety-in-svelte-guard-components-f3d69063a58f                |
| Sabaoon — Svelte Best Practices                   | https://www.sabaoon.dev/blog/svelte-best-practices                                                         |
| OpenReplay — Svelte Best Practices                | https://blog.openreplay.com/svelte-best-practices/                                                         |
