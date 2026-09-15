# ADR-0018: Scaling Theme Boards from HDTV to 2K and 4K TVs

## Status

Accepted

## Context

Seasonal leaderboard boards are full-screen TV kiosk UIs rendered inside the
houses page shell (`src/routes/leaderboard/houses/+page.svelte`: `flex h-screen
flex-col overflow-hidden`) wrapped by the TV shell
(`src/routes/leaderboard/+layout.svelte`: `.leaderboard-tvshell`). The shell
clips anything taller than the viewport — there is no scrolling, so overflow
means content is silently cut off.

We learned the scaling rules the hard way, across three rounds:

1. **Prototype phase checked HDTV only (1920×1080).** The promoted Christmas
   workshop and CNY lantern boards looked right at 1080p but collapsed on 4K
   (3840×2160): graphics and text rendered at the same pixel size on 4× the
   pixels — half the relative size — and fixed-width containers sat in a narrow
   centered column with empty margins.
2. **The 4K fix broke HDTV.** Raising `clamp()` ceilings and un-capping
   containers fixed 4K but pushed card interiors taller than the viewport, so
   the bottoms of the house cards (Nice list / Top carvers rows) were cut off
   on HDTV. A second pass shrank interiors ~25%; a third pass realigned card
   headers to the default theme's crest-left / rank+points-right row to free
   vertical space.
3. **Thanksgiving themes repeated the cycle.** The Feast Table and Hearthside
   Ledger had the same frozen-`rem` / frozen-`text-xs` problems and needed the
   identical pass afterward.

Root causes, in every case:

- `clamp(X, Nvw, Yrem)` ceilings hit long before 4K. At 1080p `6vw` = 115px
  vs a `7rem` (112px) cap looks fine; at 4K `6vw` = 230px but the `7rem` cap
  still clamps to 112px.
- Hard-capped containers (`max-w-6xl`, `max-w-[96rem]`, `w-[min(96vw,1300px)]`)
  never grow past ~1300–1536px on a 3840px screen.
- Frozen type (`text-xs`, `text-sm`) and frozen heights (`h-1.5`, `h-8`)
  never scale at all.
- Sections declaring `min-h-[calc(100vh-4rem)]` inside a shell that already
  consumes the full viewport plus its own padding always overflow; the shell's
  `overflow-hidden` then cuts card bottoms at every resolution.

The global safety net is proportional root scaling in `src/app.css`
(`:root:has(.leaderboard-tvshell)` → `font-size: clamp(1rem, 0.833vw, 2rem)`,
so 1080p ≈ 16px and 4K ≈ 32px) plus TV breakpoints (`fhd` 120rem, `qhd`
160rem, `uhd` 240rem). Per-component rules below are still required — root
scaling alone does not fix capped containers or `overflow-hidden` clipping.

## Decision

**Every new theme board follows the TV-scaling contract below.** Design at
1080p, verify the math to 4K, and test both (plus 2K/2560×1440) before merge.

### 1. Fit the shell, never fight it

- Root element: `flex h-full min-h-0 flex-col`. Never
  `min-h-[calc(100vh-…)]` — the shell already owns the viewport.
- Header: `shrink-0`. Content grid: `flex-1 min-h-0` so it absorbs the
  remainder instead of forcing overflow.
- Cards: `flex flex-col` + `overflow-hidden` (+ `min-h-0` on inner blocks), so
  extreme content clips inside the rounded card rather than bleeding past it.
- Footer lists (`Nice list`, `Top carvers`, growth lists): pin with `mt-auto`
  so short cards match tall ones in a row.

### 2. Size with the viewport, not with frozen units

- **Text that must grow:** `text-[clamp(<1080p-px-as-rem>, <vw>, <≈2×-in-rem>)]`.
  The `vw` middle must reproduce the approved 1080p pixel value
  (e.g. `text-[clamp(1rem,1.15vw,2.2rem)]` ≈ 16px at 1080p, ~44px at 4K).
  Never ship `text-xs`/`text-sm` on TV-visible copy — they freeze.
- **Hero numbers and crests:** guard both axes with
  `min(<vw>,<vh>)`, e.g. `text-[clamp(2.25rem,min(4vw,8vh),6.5rem)]` for
  points, `size-[clamp(3.5rem,min(4.5vw,9vh),6.5rem)]` for crests. Width-only
  guards overflow on short screens; height-only guards shrink on wide ones.
- **Vertical rhythm in `vh`:** card padding (`py-[1.2vh]`), gaps
- Keep `leading-tight` on dense name rows; it saves ~15% vertical per row.
  (`space-y-[0.4vh]`, `gap-[1.5vh]`), bars (`h-[1vh] min-h-2`), stagger
  offsets (`calc(i * 3vh)`). Keeps proportions on 16:9 at any size.
- **Containers uncapped:** `max-w-none w-full`, section padding `px-[3vw]` —
  full-bleed with proportional margins at every resolution.
- **Ceilings ≈ 2× the 1080p value:** title `6rem`, totals `6–8rem`, crests
  `6.5rem`, lanes `38rem`. At 1080p the `vw` middles land within a few px of
  the old values (no visible change); at 4K the `vw` middle does the growth.

### 3. Reuse the global scaling, don't duplicate it

- `src/app.css` root scaling (`:root:has(.leaderboard-tvshell)`) and the
  `fhd`/`qhd`/`uhd` breakpoints already exist — new boards get them for free.
  Do not add per-board root `font-size` rules.
- Per-board `clamp()`s still matter: root scaling moves `rem` values, but it
  cannot un-cap a `max-w`, un-freeze a `text-xs`, or stop `overflow-hidden`
  clipping. Both layers are required.

### 4. Content budget per card

- Cap lists explicitly: 5 top contributors + 3 growth opportunities fits
  1080p after the header realignment (crest-left / rank-pill + points-right
  row, per the default theme). If a design is still tight, cut names
  (5→4), never shrink type below the `clamp()` floor.
- Growth lists render from `growthOpportunities` with `?? []` + `{:else}`
  fallback copy, so empty data collapses gracefully instead of leaving a gap.

### 5. Verification checklist (all required)

1. `bun run check` — 0 errors, 0 warnings.
2. `bunx eslint` + `prettier --check` on touched files — clean.
3. Component test in real Chromium (`tests/lib/components/…`) asserting
   totals, contributor names, and crest `aria-label`s render.
4. **Visual check at 1920×1080 AND 3840×2160** (plus 2560×1440 if available)
   via admin `?theme=` preview — no admin DB writes needed. Math is not a
   substitute: the test browser runs ~720p, so 4K scaling is verified by
   clamp arithmetic plus eyes on the real display.
