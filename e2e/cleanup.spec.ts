/**
 * E2E Test Cleanup Suite
 *
 * This file provides comprehensive cleanup for all test data created during E2E test execution.
 * Run with: bun run test:e2e:cleanup
 *
 * ## Cleanup Strategy
 *
 * 1. **Test Users** - Uses cleanupTestUsers() from convex-client
 * 2. **Test Data** - Students, evaluations, categories with e2eTag
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
import { cleanupTestUsers, cleanupByTag } from './convex-client';

/**
 * Cleanup all test users
 */
test('cleanup test users', async () => {
	try {
		const result = await cleanupTestUsers();
		console.log('Test users cleanup result:', JSON.stringify(result, null, 2));
	} catch (error) {
		console.warn('Test users cleanup skipped:', error);
	}
});

/**
 * Cleanup all test data (students, evaluations, categories with e2eTag)
 */
test('cleanup all test data', async () => {
	try {
		const result = await cleanupByTag('all', 'e2e-test');
		console.log('Test data cleanup result:', JSON.stringify(result, null, 2));
	} catch (error) {
		console.warn('Test data cleanup skipped:', error);
	}
});

/**
 * Complete cleanup - runs all cleanup functions
 */
test('complete e2e cleanup', async () => {
	const results: Record<string, unknown> = {};

	try {
		// Cleanup test users
		try {
			results.testUsers = await cleanupTestUsers();
		} catch (e) {
			results.testUsers = { error: String(e) };
		}

		// Cleanup test data
		try {
			results.testData = await cleanupByTag('all', 'e2e-test');
		} catch (e) {
			results.testData = { error: String(e) };
		}

		console.log('Complete E2E cleanup results:', JSON.stringify(results, null, 2));
	} catch (error) {
		console.error('Complete cleanup failed:', error);
		throw error;
	}
});
