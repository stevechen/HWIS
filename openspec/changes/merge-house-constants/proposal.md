## Why
House constants are defined in two files: `src/convex/shared/houses.ts` (server, 11 lines) defines `HOUSES` and `HOUSE_VALIDATOR` with the server type derived via `typeof HOUSES`. `src/lib/constants/houses.ts` (client, 32 lines) defines the same `HOUSES` array, an explicit literal `House` type, and the `HOUSE_COLORS` record. Adding a fifth house requires editing two files and ensuring both type derivations stay in sync.

## What Changes
- Move the canonical `HOUSES` constant to `src/lib/constants/houses.ts` as the single source of truth
- Have the server `src/convex/shared/houses.ts` import from the client library
- The client adapter keeps `HOUSE_COLORS`; the server adapter keeps `HOUSE_VALIDATOR`
