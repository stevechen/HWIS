import { test as base, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudent, cleanupTestData } from './convex-client';

export { getTestSuffix, expect };

export async function cleanupE2EData(page: any, testId: string) {
	const suffix = getTestSuffix(testId);
	try {
		await cleanupTestData(suffix);
	} catch (e) {
		console.log(`[TEST] Cleanup skipped for ${testId}`);
	}
}
