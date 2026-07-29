# 01 — AI test result compressor

**What to build:** A local script that wraps Playwright (via `bunx`) with `--reporter=json`, pipes the JSON through a compressor that strips all pass/setup/cleanup noise, and prints a token-efficient summary for AI consumption.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] **Core compressor function** — A module at `scripts/test-compressor.ts` exporting `compressResults(rawJson: object): string`. Input is a Playwright JSON report; output is:
  - `"All N tests passed."` when zero failures
  - A compressed per-failure block: test name, file:line, error message, first relevant stack frame (not the Playwright internals trace)
- [ ] **Vitest seam** — `scripts/test-compressor.test.ts` with two canned fixtures:
  - `all-pass` fixture → asserts the one-liner
  - `two-failures` fixture → asserts per-failure lines match expected format
- [ ] **CLI runner** — A script at `scripts/run-tests-ai.ts` (invoked via `bun scripts/run-tests-ai.ts`) that:
  - Spawns `bunx playwright test --reporter=json` for the full e2e suite
  - Pipes stdout through the compressor
  - Prints only the compressed output to stdout
  - Exits 0 on all-pass, non-zero on failure
  - Accepts optional `--project`, `--grep` args for targeting subsets
- [ ] **npm script + docs** — Add `test:ai` to package.json scripts. Add a note in AGENTS.md describing the convention: agents use `bun run test:ai` instead of `bunx playwright test` to save tokens; the compressed output is the sole source of truth for failures.
