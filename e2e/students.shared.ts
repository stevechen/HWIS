import { expect, type Page } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { cleanupTestData } from './convex-client';

export { getTestSuffix, expect };

export async function cleanupE2EData(_page: Page, tag: string) {
	try {
		await cleanupTestData(tag);
	} catch {
		// Cleanup skipped
	}
}
