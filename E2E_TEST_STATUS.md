# E2E Test Status - Outdated Document

This document is no longer relevant. The old test infrastructure issues described below have been resolved.

## Current Testing Approach

The project now uses a `testRole` query parameter for E2E tests instead of the old test mode system:

```typescript
// Navigate with test role
await page.goto('/?testRole=admin');
await page.waitForSelector('body.hydrated');
```

## Test Auth Files

E2E tests use auth files in `e2e/.auth/`:
- `admin.json` - Admin user credentials
- `teacher.json` - Teacher user credentials  
- `super.json` - Super user credentials
- `test.json` - Test role configuration

## See Also

- [TESTING.md](TESTING.md) - Current testing documentation
