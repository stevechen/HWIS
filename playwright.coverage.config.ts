import { type PlaywrightTestConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// Coverage runs are driven by scripts/run-coverage-e2e.sh, which starts an
// instrumented Vite dev server (VITE_COVERAGE=true) on port 5173 and tears it
// down. Playwright's own webServer is NOT used here: with
// reuseExistingServer:false it refuses to start if the port is occupied, and
// that check fires before the command runs, so a stale server can never be
// cleaned up from inside the config.
//
// The Vite port must be 5173: the dev auth stack hardcodes
// http://localhost:5173 as its base URL / trusted origin (src/lib/auth-client.ts,
// src/convex/auth.ts, the auth +server.ts, etc.), so any other port makes
// browser auth cross-origin AND makes better-auth reject state-changing POSTs
// (e.g. sign-out) with a 403 CSRF error.
const config: PlaywrightTestConfig = {
	...baseConfig,
	use: {
		...baseConfig.use,
		baseURL: 'http://localhost:5173'
	},
	// Istanbul-instrumented modules compile on first request (measured ~11s
	// cold per route). On coverage runs give tests and assertions more room;
	// the base 30s timeout can be exceeded when several routes compile cold
	// in one test (e.g. logout flows).
	timeout: 120_000,
	expect: {
		timeout: 30_000
	}
};

export default config;
