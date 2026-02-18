/**
 * E2E Test Cleanup Suite
 *
 * This file provides cleanup for test data created during E2E test execution.
 * Run with: bun run test:e2e:cleanup
 *
 * ## Cleanup Strategy
 *
 * 1. **Test Data** - Students, evaluations, categories, audit logs with e2eTag
 *
 * ## Usage
 *
 * ```bash
 * # Run cleanup after tests
 * bun run test:e2e:cleanup
 *
 * # Full test suite with cleanup
 * bun run test:e2e:full
 * ```
 */

import { test } from '@playwright/test';
import { cleanupAllE2eTaggedData } from './convex-client';

/**
 * Cleanup all test data (students, evaluations, categories, audit logs with e2eTag)
 */
test('cleanup all test data', async () => {
	try {
		const result = await cleanupAllE2eTaggedData();
		console.log('Test data cleanup result:', JSON.stringify(result, null, 2));
	} catch (error) {
		console.warn('Test data cleanup skipped:', error);
	}
});
