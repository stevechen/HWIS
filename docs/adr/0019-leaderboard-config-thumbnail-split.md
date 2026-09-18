# ADR-0019: Leaderboard Config and Screenshots Live in Separate Rows

## Status

Accepted

Supersedes the storage half of ADR-0015 (screenshots are no longer kept in the
`thumbnailUrl` / `themes` fields of the board config row).

## Context

Both TV boards (`/leaderboard/houses`, `/leaderboard/classes`) are always-on
kiosk pages that subscribe to `leaderboards.getPublicConfig` for exactly two
values: `enabled` and `theme`. That query read
`settings['leaderboard.<board>']` — the same row that carried every theme
screenshot as a base64 data URL (ADR-0015, extended to a five-theme map).

Measured on the dev deployment before this change:

| Row                   | Stored bytes | of which `themes` | of which legacy `thumbnailUrl` |
| --------------------- | ------------ | ----------------- | ------------------------------ |
| `leaderboard.classes` | 709,354      | 588,746           | 120,442                        |
| `leaderboard.houses`  | 185,647      | 49,763            | 135,718                        |

Consequences of that layout:

1. **Every board load re-read ~700 KB** (classes) or ~186 KB (houses) to learn
   two flags. Convex bills database I/O per byte read, so the read set — not the
   returned payload — is what costs quota.
2. **Every screenshot capture invalidated both boards.** `leaderboards.update`
   patched the whole row, so the boards re-read their blob-laden config, and the
   admin page's `list` subscription re-read all screenshots (~875 KB) once per
   capture — ten captures per theme sweep.
3. **The legacy `thumbnailUrl` field was write-only dead weight** (nothing in the
   UI reads it) that could never be cleared, because `update` preserved
   `parsed.thumbnailUrl`.

## Decision

**Split the data by read pattern.**

1. `settings['leaderboard.<board>']` stores only `{ enabled, theme, updatedAt }`
   (~60 B). `getPublicConfig` returns exactly those fields; the screenshot-free
   shape is encoded in the `PublicLeaderboardConfig` type so it can't regress
   silently.
2. Screenshots live in the new `leaderboard_thumbnails` table
   (`board`, `theme`, `url`, `updatedAt`; indexes `by_board_theme`, `by_board`),
   written one theme at a time. A capture writes ~15 KB instead of ~700 KB and
   touches no row the live boards subscribe to.
3. `leaderboards.list` (admin-only) still returns the familiar
   `{ board, enabled, theme, themes, updatedAt }` shape — it assembles `themes`
   from the thumbnails table — so the management page needed no changes.
4. The legacy `thumbnailUrl` argument was removed from `update`; `parseStoredConfig`
   ignores leftover keys, and `update` rewrites the compact shape so an old row
   shrinks on the next admin write.
5. `leaderboards.migrateThumbnails` (internal mutation, idempotent) moves existing
   screenshots into the table and compacts the row. Run once per deployment:
   `bunx convex run leaderboards:migrateThumbnails`. Without it the boards keep
   reading the legacy blobs (the query is tolerant, so nothing breaks — it just
   stays expensive).

## Consequences

- Board config reads drop from ~700 KB / ~186 KB to a few dozen bytes, and
  screenshots no longer invalidate them at all. Board page loads and theme
  switches stop being a database-I/O line item.
- Screenshots cost one small row write each; storage is roughly unchanged, and
  no row approaches the 1 MB document limit as themes are added.
- The management page's preview seeding is unchanged from a component's point of
  view (same `themes` map), but it now costs `list` an extra indexed read per
  board (5 rows max).
- Two sources of truth exist during the migration window: until
  `migrateThumbnails` runs, the screenshots are still in the old row, and
  `list` will not show them. Re-running the migration later is safe.
