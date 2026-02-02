/**
 * E2E Test Cleanup Suite
 *
 * This file provides comprehensive cleanup for all test data created during E2E test execution.
 * Run with: bun run test:e2e:cleanup
 *
 * ## Cleanup Strategy
 *
 * 1. **Weekly Reports Data** - Uses 'weekly-reports-test' tag
 * 2. **All Test Data** - Students, evaluations, categories, audit logs with e2eTag
 * 3. **Test Users** - Convex users with test authIds
 * 4. **Better Auth Users** - Test user accounts in Better Auth
 *
 * ## Tables Cleaned
 *
 * | Table | Cleanup Method |
 * |-------|---------------|
 * | students | e2eTag |
 * | evaluations | e2eTag |
 * | point_categories | e2eTag |
 * | audit_logs | e2eTag OR performerId starting with 'e2e_', 'test_', 'eval_' |
 * | users | authId starting with test prefixes |
 * | Better Auth users | email containing 'test' or 'hwis.test' |
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

import { test as cleanup } from '@playwright/test';

const CONVEX_URL = process.env.CONVEX_URL || 'http://localhost:3210';

interface CleanupResult {
	success: boolean;
	message: string;
	details?: Record<string, number>;
}

async function callConvexMutation(
	token: string,
	mutation: string,
	args: Record<string, unknown> = {}
): Promise<CleanupResult> {
	const response = await fetch(`${CONVEX_URL}/api/mutation`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({
			path: mutation,
			args
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Convex mutation failed: ${error}`);
	}

	return response.json();
}

async function getAuthToken(): Promise<string | null> {
	const token = process.env.CONVEX_AUTH_TOKEN?.split('|')[1];
	if (!token) {
		console.warn('CONVEX_AUTH_TOKEN not set, cleanup will be skipped');
		return null;
	}
	return token;
}

/**
 * Cleanup weekly reports test data
 * Removes students, evaluations, audit logs, users, and categories with 'weekly-reports-test' tag
 */
cleanup('cleanup weekly reports test data', async () => {
	const token = await getAuthToken();
	if (!token) return;

	try {
		const result = await callConvexMutation(
			token,
			'testData.weeklyReports.cleanupWeeklyReportTestData',
			{}
		);
		console.log('Weekly reports cleanup result:', JSON.stringify(result));
	} catch (error) {
		console.warn('Weekly reports cleanup skipped:', error);
	}
});

/**
 * Cleanup all test data across all tables
 * Targets: students, evaluations, point_categories, audit_logs with e2eTag
 */
cleanup('cleanup all test data (nuclear cleanup)', async () => {
	const token = await getAuthToken();
	if (!token) return;

	try {
		// Step 1: Clean up all test data (students, evaluations, categories, audit logs with e2eTag)
		const dataResult = await callConvexMutation(token, 'testCleanup.cleanupAllTestData', {});
		console.log('Test data cleanup result:', JSON.stringify(dataResult));

		// Step 2: Clean up orphaned test users from Convex users table
		const usersResult = await callConvexMutation(token, 'testCleanup.cleanupAllTestUsers', {});
		console.log('Test users cleanup result:', JSON.stringify(usersResult));

		// Step 3: Clean up any remaining test Better Auth users
		try {
			const baResult = await callConvexMutation(token, 'testSetup:cleanupTestUsers', {});
			console.log('Better Auth users cleanup result:', JSON.stringify(baResult));
		} catch {
			console.warn('Better Auth users cleanup skipped (may not be needed)');
		}

		console.log('Nuclear cleanup completed successfully');
	} catch (error) {
		console.error('Nuclear cleanup failed:', error);
		throw error;
	}
});

/**
 * Complete cleanup - runs all cleanup functions in sequence
 * This is the recommended cleanup to use at the end of test runs
 */
cleanup('complete e2e cleanup', async () => {
	const token = await getAuthToken();
	if (!token) return;

	const results: Record<string, unknown> = {};

	try {
		// Step 1: Weekly reports cleanup
		try {
			results.weeklyReports = await callConvexMutation(
				token,
				'testData.weeklyReports.cleanupWeeklyReportTestData',
				{}
			);
		} catch (e) {
			results.weeklyReports = { error: String(e) };
		}

		// Step 2: All test data cleanup
		try {
			results.testData = await callConvexMutation(token, 'testCleanup.cleanupAllTestData', {});
		} catch (e) {
			results.testData = { error: String(e) };
		}

		// Step 3: Test users cleanup
		try {
			results.testUsers = await callConvexMutation(token, 'testCleanup.cleanupAllTestUsers', {});
		} catch (e) {
			results.testUsers = { error: String(e) };
		}

		// Step 4: Better Auth users cleanup
		try {
			results.betterAuthUsers = await callConvexMutation(token, 'testSetup:cleanupTestUsers', {});
		} catch (e) {
			results.betterAuthUsers = { error: String(e) };
		}

		console.log('Complete E2E cleanup results:', JSON.stringify(results, null, 2));
	} catch (error) {
		console.error('Complete cleanup failed:', error);
		throw error;
	}
});

/**
 * Verify cleanup - reports what test data remains in the database
 * Useful for debugging cleanup issues
 */
cleanup('verify cleanup (debug)', async () => {
	const token = await getAuthToken();
	if (!token) return;

	// This is a placeholder - in a real implementation, you'd query each table
	// to check for remaining test data
	console.log('Verification not implemented - run cleanup and check database manually');
});
