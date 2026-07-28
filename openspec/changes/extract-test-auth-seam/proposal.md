## Why

The auth module contains 30+ lines of testToken plumbing that creates implicit auth behavior in dev mode. `shouldAutoInjectToken` silently upgrades any call to `requireAdminForSensitiveOperation` to admin in non-production. `_testAuthRole` global mutable state makes test execution order matter. Tests never pass a `testToken` argument — they rely entirely on this invisible auto-injection. Deleting this plumbing breaks every existing test, confirming tests are tightly coupled to implicit behavior.

## What Changes

- Extract testToken plumbing and `_testAuthRole` into a dedicated `testAuth.ts` module
- Production auth.ts keeps its clean interface with no test-token awareness
- Test files import from the explicit test-auth seam with `setTestAuthRole(role)` and `injectTestToken(ctx, role)`
- Auto-injection in dev mode becomes opt-in via the test helper
