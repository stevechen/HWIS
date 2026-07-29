## Context

The auth module (`src/convex/auth.ts`) contains ~40 lines of testToken plumbing mixed into production auth logic:

- `_testAuthRole` mutable module-level state
- `setTestAuthRole()` function
- `shouldAutoInjectToken()` silently upgrades calls in non-prod
- `ForSensitiveOperation` wrappers auto-inject `unit-test-token` when no token is passed and runtime is non-prod
- `getAuthenticatedUser` handles E2E_TEST_TOKEN and default unit-test tokens
- `requireAdminRole` and `requireSuperRole` have implicit test-token role upgrades

This creates implicit auth behavior in dev/test mode and makes test execution order matter.

## Goals / Non-Goals

**Goals:**

- Extract all testToken plumbing into a dedicated `testAuth.ts` module
- Production `auth.ts` keeps a clean interface with no test-token awareness
- `ForSensitiveOperation` wrappers become opt-in via `resolveEffectiveTestToken()` from testAuth
- All existing test behavior preserved (tests still pass without passing testToken arguments in unit tests)
- e2e test behavior preserved

**Non-Goals:**

- Not changing how production auth works
- Not refactoring every caller to pass testToken explicitly
- Not changing the e2e auth flow

## Decisions

1. **New `testAuth.ts` module** with exports:
   - `setTestAuthRole(role)` / `getTestAuthRole()` – control test auth role
   - `injectTestToken(ctx, role?)` – returns test token string (for mutation/query ctx)
   - `getTestTokenForRole(role)` – returns token string for a given role
   - `resolveEffectiveTestToken(testToken?)` – auto-inject logic extracted from `shouldAutoInjectToken`
   - `getTestAuthUser(role)` – returns fake user object for a role

2. **`auth.ts` changes:**
   - Remove `_testAuthRole`, `setTestAuthRole`, `shouldAutoInjectToken`
   - Import `resolveEffectiveTestToken` from `testAuth.ts`
   - `ForSensitiveOperation` wrappers use `resolveEffectiveTestToken` instead of `shouldAutoInjectToken`
   - Keep `isTestRuntime`, `isProdDeployment`, `getEnvValue` in `auth.ts` (used by many modules)

3. **Tests import from `testAuth.ts`:**
   - `users.test.ts` imports `setTestAuthRole` from `./testAuth` instead of `./auth`

4. **No caller changes needed** for `requireAdminForSensitiveOperation(ctx)` calls without explicit testToken – the auto-injection remains via `resolveEffectiveTestToken`

## Risks / Trade-offs

- **Circular dependency risk**: `testAuth.ts` imports `getEnvValue` from `auth.ts`, and `auth.ts` imports `resolveEffectiveTestToken` from `testAuth.ts`. Mitigation: the circular dep is limited and both files are in the same module group; Node.js/Convex resolve it without issues.
- **`isTestRuntime` duplication**: Both modules need this. Keep canonical definition in `auth.ts`, import it in `testAuth.ts`.
