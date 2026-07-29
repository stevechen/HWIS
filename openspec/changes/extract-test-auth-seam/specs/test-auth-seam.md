# Test Auth Seam Extraction

## Capability

Extract testToken plumbing from `auth.ts` into dedicated `testAuth.ts`.

## Requirements

1. All test-token related code (`_testAuthRole`, `setTestAuthRole`, `shouldAutoInjectToken`, test token validation logic) is removed from `auth.ts`.
2. A new `testAuth.ts` module exports:
   - `setTestAuthRole(role: 'admin' | 'super')`
   - `getTestAuthRole(): 'admin' | 'super'`
   - `injectTestToken(ctx, role?)` – returns a test token string for use in mutations/queries
   - `getTestTokenForRole(role: 'admin' | 'super'): string | undefined`
   - `resolveEffectiveTestToken(testToken?: string): string | undefined`
   - `getTestAuthUser(role: 'admin' | 'super')`
3. `auth.ts` imports `resolveEffectiveTestToken` from `testAuth.ts` and uses it in `ForSensitiveOperation` wrappers.
4. `users.test.ts` imports `setTestAuthRole` from `./testAuth` instead of `./auth`.
5. `testAuth.ts` imports `getEnvValue` and `isTestRuntime` from `auth.ts` (shared env utilities stay in `auth.ts`).
6. All existing tests pass without modification.

## Scope

- Only `src/convex/auth.ts`, `src/convex/testAuth.ts` (new), and import paths in test files.
- No changes to how e2e flows work.
