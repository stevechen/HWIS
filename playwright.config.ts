import { type PlaywrightTestConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const hasTeacherAuth = fs.existsSync(path.join(process.cwd(), 'e2e/.auth/teacher.json'));
// hasAdminAuth is used conditionally below

const config: PlaywrightTestConfig = {
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 120000
	},
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'setup',
			testMatch: 'e2e/setup.spec.ts'
		},
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			testMatch: /^(?!.*(setup|cleanup)).*\.spec\.ts$/
		},
		{
			name: 'chromium-authenticated',
			use: {
				...devices['Desktop Chrome'],
				storageState: 'e2e/.auth/admin.json'
			},
			testMatch: 'e2e/audit.spec.ts'
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] },
			testMatch: /^(?!.*(setup|cleanup)).*\.spec\.ts$/
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] },
			testMatch: /^(?!.*(setup|cleanup)).*\.spec\.ts$/
		},
		...(hasTeacherAuth
			? [
					{
						name: 'authenticated',
						use: {
							...devices['Desktop Chrome'],
							storageState: 'e2e/.auth/teacher.json'
						},
						testMatch: 'e2e/evaluations.spec.ts'
					}
				]
			: []),
		{
			name: 'cleanup',
			testMatch: 'e2e/cleanup.spec.ts'
		}
	],
	setupProject: {
		name: 'setup',
		testMatch: 'e2e/setup.spec.ts'
	},
	teardown: 'cleanup'
};

export default config;
