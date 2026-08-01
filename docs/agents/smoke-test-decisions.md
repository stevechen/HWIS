# Smoke-Only Browser Unit Test Decisions (Ticket #41)

## Removed (2 files)

- `tests/routes/admin/weekly-reports.test.ts` — broken `./pages` import + superseded by e2e `weekly-reports.spec.ts`
- `tests/routes/home-redirect.test.ts` — marginal coverage, redundant with e2e `session.spec.ts`

## Kept (5 files)

- `tests/routes/evaluations/evaluations-list.test.ts` — empty state UI coverage
- `tests/routes/admin/academic/academic.test.ts` — unique page rendering
- `tests/routes/admin/students/students.test.ts` — UI element visibility (buttons, search, filters)
- `tests/routes/login/login.test.ts` — Google SSO button + domain note
- `tests/lib/evaluations/components/states.test.ts` — component-level state rendering

These 5 files provide unique coverage at the component/browser unit level that e2e tests do not cover. Do not revisit this decision.
