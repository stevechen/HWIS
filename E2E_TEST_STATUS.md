# E2E Test Seeding Implementation Status

## Accomplished

### 1. Fixed ConvexHttpClient instantiation in +layout.svelte

- Changed from `ConvexHttpClient.create('/')` to `new ConvexHttpClient('/')`
- This fixes the TypeScript error and ensures proper client creation

### 2. Fixed teacherId in testE2E.ts seeding functions

- Changed from `'' as Id<'users'>` to actual user IDs
- This fixes the schema validation error when seeding evaluations

### 3. Fixed server response headers immutability

- Modified hooks.server.ts to clone response before setting x-test-mode header
- Changed from direct header mutation to creating new Response with updated headers

### 4. Updated auth cookie format

- Changed from `hwis_test_auth=true` to `hwis_test_auth=admin`
- Server now recognizes 'admin' as a valid test role

### 5. Updated server-side auth detection

- Modified hooks.server.ts to recognize 'admin' as test role (not just 'true')
- Updated +layout.server.ts with same logic

### 6. Added test admin user to seeding

- seedAll function now creates a user with authId='test_admin' and role='admin'
- Modified viewer query to look for this user when authUser.\_id is not set

### 7. Fixed empty teacherId in seedCategoriesForDelete

- Added teacher user creation before creating evaluations

## Remaining Issues

### Convex Auth Not Recognizing Test Mode

The core issue is that Convex functions run on the Convex cloud service and use Better Auth for authentication. When in test mode:

- SvelteKit sets `event.locals.user` correctly with role 'admin'
- But Convex's `authComponent.safeGetAuthUser()` doesn't recognize the mock token
- Returns authUser without `_id`, so viewer query defaults to 'teacher' role
- Client-side redirect to '/' happens because role isn't admin/super

### Solutions to Explore

1. **Create test admin via Better Auth**: Register a real test user through Better Auth's API
2. **Modify viewer query to accept test role**: Pass test role through a custom claim or environment variable
3. **Bypass Convex auth in test mode**: Add a test mode flag to Convex functions
4. **Use real Google auth for tests**: Configure Google OAuth for testing (complex)

## Files Modified

- `src/routes/+layout.svelte` - Fixed ConvexHttpClient instantiation
- `src/convex/testE2E.ts` - Fixed teacherId, added test admin user creation
- `src/hooks.server.ts` - Fixed response headers, added admin role support
- `src/routes/+layout.server.ts` - Added admin role support
- `src/convex/users.ts` - Modified viewer query to look for test_admin user

## Test Status

- Tests still redirect to '/' because viewer query returns 'teacher' role
- Seeding functions work correctly (seed result: {"success":true})
- Server-side auth detection works (isTestMode:true, testRole:"admin")
- Client-side JavaScript fails to get admin role from Convex
