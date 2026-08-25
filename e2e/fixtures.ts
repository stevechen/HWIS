import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { clearAuth } from './convex-client';

interface CoverageWindow {
	__coverage__?: Record<string, unknown>;
}

interface AuthFixtures {
	authenticatedPage: boolean;
}

export type Role = 'admin' | 'teacher' | 'super';

interface SessionFixtures {
	role: Role | undefined;
}

const isCoverageEnabled = process.env.VITE_COVERAGE === 'true';
const rawCoverageDir = process.env.COVERAGE_E2E_RAW_DIR ?? 'coverage/e2e/raw';

const ROLE_STORAGE: Record<Role, string> = {
	admin: path.join('e2e', '.auth', 'admin.json'),
	teacher: path.join('e2e', '.auth', 'teacher.json'),
	super: path.join('e2e', '.auth', 'super.json')
};

export const test = base.extend<AuthFixtures & SessionFixtures>({
	authenticatedPage: [false, { option: true }],
	role: [undefined, { option: true }],
	page: async ({ page, role }, use, testInfo) => {
		if (role) {
			const authPath = ROLE_STORAGE[role];
			const state = JSON.parse(fs.readFileSync(authPath, 'utf-8')) as {
				cookies: Array<{ name: string; value: string }>;
				origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
			};

			await page.context().addCookies(state.cookies);
			await page.addInitScript((origins) => {
				for (const origin of origins) {
					for (const item of origin.localStorage) {
						window.localStorage.setItem(item.name, item.value);
					}
				}
			}, state.origins);

			// Role fixture sets browser auth but leaves Convex client as admin
			// so beforeEach can create data with admin privileges, then browser
			// navigates as the specified role for UI permission tests
		} else {
			clearAuth();
		}

		await use(page);

		if (!isCoverageEnabled) return;

		const coverage = await page
			.evaluate(() => (globalThis as CoverageWindow).__coverage__)
			.catch(() => undefined);
		if (!coverage) return;

		await fs.promises.mkdir(rawCoverageDir, { recursive: true });
		const safeTitle = testInfo.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
		const filename = `${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.testId}-${testInfo.retry}-${safeTitle}.json`;
		await fs.promises.writeFile(
			path.join(rawCoverageDir, filename),
			JSON.stringify(coverage),
			'utf-8'
		);
	}
});

export { expect };
export type { Locator, Page } from '@playwright/test';
