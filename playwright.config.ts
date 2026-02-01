import { type PlaywrightTestConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const hasTeacherAuth = fs.existsSync(path.join(process.cwd(), 'e2e/.auth/teacher.json'));
const hasSuperAuth = fs.existsSync(path.join(process.cwd(), 'e2e/.auth/super.json'));

const config: PlaywrightTestConfig = {
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	webServer: {
		command: 'bash scripts/start-dev-servers.sh',
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
			testMatch: /^(?!.*(setup|cleanup)).*\.spec\.ts$/,
			dependencies: ['setup']
		},
		{
			name: 'chromium-authenticated',
			use: {
				...devices['Desktop Chrome'],
				storageState: 'e2e/.auth/admin.json'
			},
			testMatch: 'e2e/audit.spec.ts',
			dependencies: ['setup']
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] },
			testMatch: /^(?!.*(setup|cleanup)).*\.spec\.ts$/,
			dependencies: ['setup']
		},
		...(hasTeacherAuth || process.env.CI
			? [
					{
						name: 'authenticated',
						use: {
							...devices['Desktop Chrome'],
							storageState: 'e2e/.auth/teacher.json'
						},
						testMatch: 'e2e/evaluations.spec.ts',
						dependencies: ['setup']
					}
				]
			: []),
		...(hasSuperAuth || process.env.CI
			? [
					{
						name: 'chromium-super',
						use: {
							...devices['Desktop Chrome'],
							storageState: 'e2e/.auth/super.json'
						},
						testMatch: 'e2e/audit.spec.ts',
						dependencies: ['setup']
					}
				]
			: []),
		{
			name: 'cleanup',
			testMatch: 'e2e/cleanup.spec.ts',
			dependencies: ['setup']
		}
	]
};

export default config;
