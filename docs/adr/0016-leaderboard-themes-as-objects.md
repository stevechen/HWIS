# ADR-0016: Leaderboard Themes as Objects

## Status

Accepted

## Context

Ticket #107 asked how seasonal leaderboard themes (Default/Enchanted Ceiling,
Thanksgiving, Christmas, Chinese New Year) should be implemented. Candidates:

1. **CSS variables** — theme colors as custom properties, swapped via a
   `data-theme` attribute.
2. **Theme objects** — a registry mapping a stored theme id to a full bundle of
   Tailwind classes plus content (labels, witty copy, motes).
3. **Tailwind config variants** — extending the Tailwind theme with per-theme
   variants and class-based switching.

Constraints: the House/Class pages were already built around a hardcoded
`theme` const interpolated into dozens of class attributes; theme choice must
persist per board in the `settings` table, apply reactively, and (per ticket
#114) be previewable from the admin page.

## Decision

**Theme objects (`src/lib/leaderboard-themes.ts`).**

1. **Zero-template-churn migration.** The pages already consume `theme.section`,
   `theme.card`, `theme.pointsGlow`, etc. The registry keeps that shape and
   swaps one line: a hardcoded const becomes
   `$derived(resolveLeaderboardTheme(config?.theme))`. CSS variables would have
   required rewriting every class interpolation to `bg-(--x)` / inline styles.
2. **Tailwind v4 is compile-time.** Dynamic values cannot be generated at
   runtime; full literal class strings in the registry are detected by the
   scanner, so every theme's utilities ship. Runtime-computed variable names
   would silently produce missing CSS.
3. **A theme is more than colors.** Radar-chart hexes, witty disabled-screen
   copy, and ambient mote glyphs travel with the theme — content CSS variables
   cannot hold. One registry row is the whole theme: style + content.
4. **Tiny persisted payload.** Convex stores a 4-literal union id
   (`default | thanksgiving | christmas | cny`); the UI resolves the bundle.
   Validation stays a one-line union check in `leaderboards.update`.
5. **Reactivity is free.** Config arrives via `useQuery`; `$derived` re-resolves
   on change — live admin preview falls out without extra plumbing.

## Consequences

- Adding a fifth theme means editing the registry (id union + options +
  bundle) — accepted at four seasonal themes; the contract test
  (`tests/lib/leaderboard-themes.test.ts`) fails loudly if a bundle ships
  incomplete keys.
- Theme switching is full-page re-render, not transitions between palettes —
  fine for TV boards that change seasonally, not interactively.
