import { expect, type Page } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { cleanupTestData } from './convex-client';

export { getTestSuffix, expect };

export async function cleanupE2EData(page: Page, testId: string) {
	const suffix = getTestSuffix(testId);
	try {
		await cleanupTestData(suffix);
	} catch {
		console.log(`[TEST] Cleanup skipped for ${testId}`);
	}
}
