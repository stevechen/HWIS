# ADR-0015: Leaderboard Thumbnails via html-to-image

## Status

Accepted

## Context

The leaderboard management page needs static preview thumbnails of the TV boards
(House Points, Class Leaderboard). The capture must run client-side in the admin's
browser and handle the boards' full CSS: Tailwind v4 utilities, backdrop-blur,
text glow, Google Fonts, and inline SVG radar charts.

Candidates evaluated (ticket #115):

1. **html2canvas** — re-implements painting in JS. The upstream release (1.4.1) is
   unmaintained and throws `Attempting to parse an unsupported color function
"oklch"` on Tailwind v4 output (oklch/oklab/color-mix). Only scattered forks
   (html2canvas-pro, html2canvas-oklch) patch this; picking a fork means betting
   on a one-off maintainer.
2. **dom-to-image / rasterizehtml** — same SVG-foreignObject family as
   html-to-image but older and less maintained.
3. **Native OffscreenCanvas + manual rendering** — full control, but re-drawing
   radar charts, fonts, and effects by hand duplicates the board for every theme.
4. **html-to-image** — serializes the DOM into SVG `<foreignObject>` and lets the
   browser paint it, so every CSS feature the browser supports (oklch,
   backdrop-filter, web fonts) captures correctly. MIT licensed, TypeScript
   types included, ~5M weekly downloads, `toPng`/`toJpeg`/`toBlob` API.

## Decision

**Use `html-to-image` (`toPng`) for board thumbnails.**

1. **Capture the live board route in a hidden same-origin iframe** (1280×720),
   wait for Convex data to settle, then `toPng(documentElement)` at 0.25
   pixelRatio (≈320px wide data URL). The board lives on its own route, so an
   iframe is the only client-side way to render it; same-origin keeps the DOM
   accessible.
2. **Store the data URL in the existing `thumbnailUrl` config field** via the
   existing `leaderboards.update` mutation — no schema change. A 320px PNG is
   tens of KB, far under the 1MB Convex string limit. If thumbnails grow (more
   boards, larger sizes), migrate to Convex file storage.
3. **Refresh is a manual admin action**, not a cron: previews go stale only when
   an admin changes a theme or re-enables a board, and the admin is already on
   the page to click Refresh.

## Consequences

- New runtime dependency `html-to-image`, loaded only by the admin management
  route (code-split; TV boards and public pages are unaffected).
- Capture fidelity depends on the admin's browser (Chrome best; Firefox can
  stall on heavy DOMs) — acceptable for a manual admin action, and the live
  board itself is always one click away via "Open in new window".
- The real iframe+capture path is not covered by automated tests (browser tests
  mock the capture seam); regressions there surface as a failed Refresh with
  an error message, never as data loss.
