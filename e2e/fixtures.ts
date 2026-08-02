import { test as base, expect } from '@playwright/test';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

interface CoverageWindow {
	__coverage__?: Record<string, unknown>;
}

interface AuthFixtures {
	authenticatedPage: boolean;
}

const isCoverageEnabled = process.env.VITE_COVERAGE === 'true';
const rawCoverageDir = process.env.COVERAGE_E2E_RAW_DIR ?? 'coverage/e2e/raw';

export const test = base.extend<AuthFixtures>({
	authenticatedPage: [false, { option: true }],
	page: async ({ page }, use, testInfo) => {
		await use(page);

		if (!isCoverageEnabled) return;

		const coverage = await page
			.evaluate(() => (globalThis as CoverageWindow).__coverage__)
			.catch(() => undefined);
		if (!coverage) return;

		await mkdir(rawCoverageDir, { recursive: true });
		const safeTitle = testInfo.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
		const filename = `${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.testId}-${testInfo.retry}-${safeTitle}.json`;
		await writeFile(path.join(rawCoverageDir, filename), JSON.stringify(coverage), 'utf-8');
	}
});

export { expect };
export type { Locator, Page } from '@playwright/test';
