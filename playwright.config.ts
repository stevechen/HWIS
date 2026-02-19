import { type PlaywrightTestConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const hasSuperAuth = fs.existsSync(path.join(process.cwd(), 'e2e/.auth/super.json'));
const runCrossBrowser = process.env.E2E_CROSS_BROWSER === '1';

const projects: PlaywrightTestConfig['projects'] = [];

// Setup
projects.push({
	name: 'setup',
	testMatch: 'e2e/setup.spec.ts'
});

// Chromium - Parallel-safe tests (skip @sequential)
projects.push({
	name: 'chromium-parallel',
	use: { ...devices['Desktop Chrome'] },
	testMatch: '**/*.spec.ts',
	testIgnore: /.*(setup|cleanup|audit)\.spec\.ts$/,
	grepInvert: /@sequential|@auth-sequential/,
	dependencies: ['setup'],
	workers: process.env.CI ? 2 : 4
});

if (runCrossBrowser) {
	// WebKit - Parallel-safe tests (skip @sequential)
	projects.push({
		name: 'webkit-parallel',
		use: { ...devices['Desktop Safari'] },
		testMatch: '**/*.spec.ts',
		testIgnore: /.*(setup|cleanup|audit)\.spec\.ts$/,
		grepInvert: /@sequential|@auth-sequential/,
		dependencies: ['setup'],
		workers: process.env.CI ? 2 : 4
	});
}

// Cleanup barrier after parallel tests, before sequential tests
projects.push({
	name: 'cleanup-after-parallel',
	testMatch: 'e2e/cleanup.spec.ts',
	dependencies: runCrossBrowser
		? ['setup', 'chromium-parallel', 'webkit-parallel']
		: ['setup', 'chromium-parallel'],
	workers: 1
});

// Chromium - Sequential tests (only @sequential)
projects.push({
	name: 'chromium-sequential',
	use: { ...devices['Desktop Chrome'] },
	testMatch: '**/*.spec.ts',
	grep: /@sequential/,
	dependencies: ['cleanup-after-parallel'],
	workers: 1
});

if (runCrossBrowser) {
	// WebKit - Sequential tests (only @sequential)
	projects.push({
		name: 'webkit-sequential',
		use: { ...devices['Desktop Safari'] },
		testMatch: '**/*.spec.ts',
		grep: /@sequential/,
		dependencies: ['chromium-sequential'],
		workers: 1
	});
}

// Auth/session destructive tests (logout, session invalidation) should run last
projects.push({
	name: 'auth-sequential',
	use: { ...devices['Desktop Chrome'] },
	testMatch: '**/*.spec.ts',
	grep: /@auth-sequential/,
	dependencies: runCrossBrowser ? ['chromium-sequential', 'webkit-sequential'] : ['chromium-sequential'],
	workers: 1
});

// Note: evaluations.spec.ts already sets teacher storageState at describe level,
// so a dedicated "authenticated" project is unnecessary.

// Super admin tests
if (hasSuperAuth || process.env.CI) {
	projects.push({
		name: 'chromium-super',
		use: {
			...devices['Desktop Chrome'],
			storageState: 'e2e/.auth/super.json'
		},
		testMatch: 'e2e/audit.spec.ts',
		dependencies: runCrossBrowser
			? ['setup', 'chromium-parallel', 'webkit-parallel', 'chromium-sequential', 'webkit-sequential']
			: ['setup', 'chromium-parallel', 'chromium-sequential'],
		workers: 1
	});

	if (runCrossBrowser) {
		projects.push({
			name: 'webkit-super',
			use: {
				...devices['Desktop Safari'],
				storageState: 'e2e/.auth/super.json'
			},
			testMatch: 'e2e/audit.spec.ts',
			dependencies: [
				'setup',
				'chromium-parallel',
				'webkit-parallel',
				'chromium-sequential',
				'webkit-sequential'
			],
			workers: 1
		});
	}
}

// Cleanup should run after all other projects
const cleanupDependencies = projects
	.map((project) => project?.name)
	.filter((name): name is string => Boolean(name));

projects.push({
	name: 'cleanup',
	testMatch: 'e2e/cleanup.spec.ts',
	dependencies: cleanupDependencies
});

const config: PlaywrightTestConfig = {
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 1,
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
	projects
};

export default config;
