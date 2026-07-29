# Tasks

- [x] Create the `testAuth.ts` module with all test-token functions
- [x] Remove test-token code from `auth.ts` and wire `ForSensitiveOperation` to use `resolveEffectiveTestToken` from `testAuth.ts`
- [x] Update `users.test.ts` to import `setTestAuthRole` from `./testAuth`
- [x] Run unit tests — all 211 must pass
- [x] Run e2e tests — all 114 pass (no regressions)
- [x] Run lint and format
