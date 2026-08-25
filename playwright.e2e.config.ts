import { type PlaywrightTestConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// E2E runs are driven by scripts/run-e2e.sh, which starts Convex + Vite on port
// 5173 and tears them down. We deliberately drop Playwright's own webServer:
// with reuseExistingServer it silently reuses a stale server and skips the
// bootstrap that starts Convex (so the app can't hydrate and tests hang), and
// with reuseExistingServer:false it refuses to start when the port is occupied
// (that check fires before the command runs, so a stale server can't be cleaned
// up from inside the config). Owning the servers in the wrapper avoids both.
//
// The Vite port must be 5173: the dev auth stack hardcodes
// http://localhost:5173 as its base URL / trusted origin (src/lib/auth-client.ts,
// src/convex/auth.ts, the auth +server.ts, etc.), so any other port makes
// browser auth cross-origin and makes better-auth reject state-changing POSTs
// (e.g. sign-out) with a 403 CSRF error.
const config: PlaywrightTestConfig = {
	...baseConfig,
	webServer: undefined,
	use: {
		...baseConfig.use,
		baseURL: 'http://localhost:5173'
	}
};

export default config;
