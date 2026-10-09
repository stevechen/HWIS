# T185 findings: Verify Taiwan Calendar API for lunar holidays + caching/fallback

Research only — no code changed. All claims cite primary sources below.
Live verification run 2026-10-09 (UTC) against `https://api.pin-yi.me` via curl;
raw payloads inspected with python3, not cached in the repo.

## 1. API shape: endpoint, fields, limits, server-side suitability

- Base: `GET https://api.pin-yi.me/taiwan-calendar/{year}/` — **trailing slash
  required**. Bare `/{year}` returns `301 Moved Permanently` to the slashed URL
  (verified: `curl -D- .../taiwan-calendar/2025` → `301 location: /taiwan-calendar/2025/`).
  A Convex action must use the slashed form (or follow redirects).
- Record shape (13 keys, stable across 2024–2027 samples): `date` (`YYYYMMDD`),
  `date_format`, `year`, `roc_year`, `month`, `month_en`, `month_en_abbr`, `day`,
  `week`, `week_abbr`, `week_chinese`, `isHoliday` (bool), `caption`.
  Sample: `{"date":"20251006",...,"week_chinese":"一","isHoliday":true,"caption":"中秋節"}`
  (fetched `.../taiwan-calendar/2025/10/`, 31-day payload).
- Lunar festivals carry their names with `isHoliday: true`: `中秋節`, `端午節`.
  Make-up/bridge days are covered with two captions: `補假` (`isHoliday: true`,
  day off) and `補行上班` (`isHoliday: false`, Saturday workday, e.g. 2025-02-08).
  Both appear in every sampled year (see §2).
- Useful query variants, all verified live except swagger-UI content itself:
  `/{year}/{month}/` (31-day slice), `/{year}/{month}/{day}/` (single record),
  `/{year}/?isHoliday=true` (2025 → 118 rows), `/health` → `{"status":"ok"}`,
  `/supported-years` → `["2017"…"2027"]`.
  Variant list per upstream README `880831ian/taiwan-calendar`
  (`github.com/880831ian/taiwan-calendar`).
- Swagger is at `/taiwan-calendar/swagger/index.html` (verified `200`, 3756 bytes),
  **not** `/taiwan-calendar/swagger/` as stated in the ticket — that path 404s
  (verified `taiwan-calendar/swagger/` → `404`). Correct the ticket's link.
- Auth: none (open GET). Rate limit: **2 requests/second**, free single-maintainer
  hosting with **no stability guarantee** — direct README quotes: "本人免費提供 API，
  但是不保證服務穩定性" and "API 有每秒 2 次請求的限制" (`880831ian/taiwan-calendar`
  README). Full-year payload ≈ 85 KB (2025: 365 records, 84561 bytes).
- Unknown year returns structured JSON, not an HTTP surprise: `.../2028/` →
  `{"http_code":404,"message":"資料取得失敗，請參考 API 文件目前支援的年份","status":"error"}`
  (verified). The seed can branch on this shape to trigger the admin-typed fallback.
- Data source: ROC Executive Yuan office calendar (中華民國政府行政機關辦公日曆表),
  same upstream as `ruyut/TaiwanCalendar` (156★, jsDelivr CDN
  `cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/{year}.json`, CC BY 4.0 with
  attribution to 政府資料開放平台). Next-year data historically publishes ~June
  (per ruyut README) — future-year rows are predictions until then.
- **Server-side suitability: yes.** Plain HTTPS GET, no auth/cookies/CORS concern
  from a Convex action (`fetch` is available in the default Convex runtime;
  `src/convex/_generated/ai/guidelines.md:355`). No new runtime dependency:
  `fetch` + JSON parse only. Month/day granularity and `?isHoliday=` let a future
  action shrink the transfer, but one full-year GET per seed is already trivial.

## 2. Correctness: 2024–2027 cross-check vs scheduler data files

Method: fetched full-year payloads for 2024/2025/2026/2027, filtered captions
matching 中秋/端午/補假/補行上班/清明/春節/國慶, compared against
`HWIS-Class_Scheduler/src/lib/data/*-schoolEvents.ts`.

| Festival          | Scheduler file (Off day)                             | API answer                                | Match                             |
| ----------------- | ---------------------------------------------------- | ----------------------------------------- | --------------------------------- |
| Moon 2024-09-17   | `2024-2025-1`: `2024-09-17 Off Moon Festival`        | 20240917 `中秋節` `isHoliday=true`        | exact                             |
| Moon 2025-10-06   | `2025-2026-1`: `2025-10-06 Off Moon Festival`        | 20251006 `中秋節` `isHoliday=true`        | exact                             |
| Moon 2026-09-25   | `2026-2027-1`: `2026-09-25 Off Moon Festival`        | 20260925 `中秋節` `isHoliday=true`        | exact                             |
| Dragon 2024-06-10 | `2023-2024-2`: `2024-06-10 Off Dragon Boat Festival` | 20240610 `端午節` `isHoliday=true`        | exact                             |
| Dragon 2025-05-30 | `2024-2025-2`: `2025-05-30 Off Dragon Boat Festival` | 20250531 `端午節` (Sat) + 20250530 `補假` | **cluster, not exact — see note** |
| Dragon 2026-06-19 | `2025-2026-2`: `2026-06-19 Off Dragon Boat Festival` | 20260619 `端午節` `isHoliday=true`        | exact                             |
| Dragon 2027 (new) | — (no scheduler file)                                | 20270609 `端午節`                         | forward data present              |
| Moon 2027 (new)   | —                                                    | 20270915 `中秋節`                         | forward data present              |

- **2025 Dragon Boat nuance (the one non-exact row).** Lunar 5/5 fell on Saturday
  2025-05-31, so the observed school off-day (Friday 05-30) is captioned `補假`,
  not `端午節` — but both rows have `isHoliday: true`. **Seed rule must therefore
  match an `isHoliday` cluster containing a lunar caption, not `caption == festival`
  on a single date.** I.e. collect contiguous `isHoliday=true` runs that include
  中秋節/端午節, and seed the weekday rows of that run as off days.
- Companion evidence the cluster rule generalises: 2024 spring has
  `補假` 02-13/02-14 + `補行上班` 02-17; 2026 has `補假` runs around spring
  (02-20, 02-27), Qingming (04-03/04-06), and Double-10 (10-09, 10-26).
  Filtering on `isHoliday` alone already yields every school off-day; captions
  only label _why_.
- 2027 rows exist today (`supported-years` includes 2027: 端午 06-09, 中秋 09-15),
  but treat them as provisional until the Executive Yuan publishes the 2027 calendar
  (~June 2026 pattern) — re-validate at seed time (§3 staleness guard).

## 3. Failure design: cache strategy + offline fallback

- Greenfield: grep over `HWIS/src` for `pin-yi|taiwan-calendar|isHoliday|semester.*seed`
  returns nothing — no existing code assumes anything about this API.
- **Recommendation: Convex table cache, year-keyed, written by the seed action.**
  Columns per day-row: `date` (`YYYYMMDD`), `isHoliday`, `caption`, `fetchedAt`,
  `sourceYear`. Seed flow: (1) read cache for the target year; (2) on miss/stale,
  one `GET /{year}/` from a Convex action (trailing slash, ≥600 ms spacing to respect
  2 req/s — cf. the `tfx-trading` backfill precedent of `sleep(0.6)` between calls
  found via web search); (3) persist, then compose lunar off days from cache.
  Never fetch at teacher-view time.
- **Resolved date vs year-keyed reference: store both.** The event row stores the
  resolved `YYYY-MM-DD` (the school calendar must be stable once announced — never
  a live re-resolving reference), plus provenance (`source: "taiwan-calendar:2026"`,
  `caption: "中秋節"`) so a later refresh can diff and flag drift (e.g. the 2027
  provisional rows changing after official publication).
- **Offline fallback chain:** (1) Convex cache hit → (2) live API →
  (3) `ruyut/TaiwanCalendar` jsDelivr CDN JSON (same upstream data, community mirror,
  CC BY 4.0 — attribution required) → (4) admin-typed date. Step 4 must be a normal
  path, not an error dead-end: the seed UI prefills an empty/flagged date field the
  admin completes.
- **Staleness gate:** at seed time, check `/supported-years` (and `/health`).
  Target year absent (e.g. 2028 today → structured 404, §1) ⇒ skip the API entirely
  and force the admin-typed path with a visible "unverified against national calendar"
  flag on the seeded lunar rows.
- Single-maintainer risk (no SLA, README-quoted) is the main argument for the cache:
  the API only needs to be reachable once per year per deployment, and every later
  seed is served from Convex.

## 4. Cost: negligible — confirm

- One ~85 KB GET per semester seed (at most a handful of seeds per year, only on
  cache miss) against a 2 req/s limit ⇒ effectively 0% quota utilisation.
  `?isHoliday=true` (≈118 rows for 2025) or month slices can shrink it further if
  desired. Reads at view time come from the Convex table, not the API — zero
  per-teacher cost.

## Interface note re sibling ticket #184 (no dependence)

- #184 ("Decide semester seed-template sets + auto rules") owns the seed-row shape
  and interface consent. This research assumes only what #184's title/body already
  state — seeded rows are individually deletable/adjustable by an admin — and needs
  nothing more: the cache columns, provenance fields, and admin-typed fallback above
  adapt to whatever row shape #184 lands. If #184 changes direction, these findings
  stand; only the column mapping moves.

## Implementation pointer (for the implementing ticket)

1. Convex action `fetchTaiwanCalendarYear({year})`: slashed URL, ≥600 ms spacing,
   writes year-keyed day rows (`date/isHoliday/caption/fetchedAt`) to a cache table.
2. Seed composes lunar off days from cache: contiguous `isHoliday=true` runs
   containing a 中秋節/端午節 caption (covers the 2025-style 補假-observed case);
   writes resolved dates + `source`/`caption` provenance onto event rows.
3. Seed-time gate: `/supported-years` + `/health`; year missing or fetch failing ⇒
   admin-typed date path with "unverified" flag; CDN mirror as middle fallback.
4. No backend change in this ticket; no new npm dependency (`fetch` only).
