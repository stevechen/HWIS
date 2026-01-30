export type TestRole = 'admin' | 'super' | 'teacher';

/**
 * NOTE: Mock authentication functions removed.
 *
 * We now use real Google OAuth with Playwright storageState.
 *
 * To capture sessions:
 * 1. Run ./scripts/capture-sessions.sh
 * 2. Follow manual login instructions for each user
 * 3. Sessions will be saved as e2e/.auth/super.json, admin.json, teacher.json
 */
