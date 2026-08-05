import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],

	test: {
		// Component tests in tests/ folder - use browser mode
		name: 'component',
		include: ['tests/**/*.test.ts'],
		exclude: ['**/node_modules/**'],
		setupFiles: ['./vitest-setup-client.ts'],

		// Increase timeout for browser tests with coverage instrumentation
		testTimeout: 30000,

		// Limit concurrency for browser tests to prevent resource contention
		maxConcurrency: 4,

		onConsoleLog(log) {
			// Silence Svelte's `derived_inert` warning in component tests.
			//
			// Root cause: bits-ui's DismissibleLayer (backs Dialog/Select/Popover/
			// DropdownMenu/Tooltip content) schedules debounced, `afterSleep` and
			// `afterTick` callbacks that read boxed `$derived` values (`ref.current`,
			// `enabled.current`) after the owning component is destroyed. Tests mount
			// and unmount these layers rapidly, so each torn-down layer floods the
			// console with one warning per pending timer (~3900 warnings per run of
			// `tests/lib/evaluations/components/dialogs.test.ts`).
			//
			// This is the conclusion of the "investigate Svelte 5 + convex-svelte
			// interplay" option: a stack-trace probe of the warnings shows 100% of
			// them originate from bits-ui's DismissibleLayer timers, not convex-svelte.
			// The reads are benign (the layer is already being torn down) and are
			// fixed upstream in https://github.com/huntabyte/bits-ui/issues/2080
			// (PR #2087), but no released bits-ui includes the fix yet. Suppress only
			// Svelte's `derived_inert` warning code; remove this filter once the fix
			// ships so genuine instances from our own components are not masked.
			if (log.includes('[svelte] derived_inert')) return false;
		},

		browser: {
			enabled: true,
			api: {
				host: '127.0.0.1'
			},
			provider: playwright(),
			instances: [{ browser: 'chromium', headless: true }]
		},

		coverage: {
			provider: 'istanbul',
			all: true,
			include: ['src/lib/**/*.{ts,svelte,js}'],
			exclude: ['src/lib/components/ui/**', 'tests/**', 'node_modules/**', '.svelte-kit/**'],
			reportsDirectory: 'coverage/component'
		}
	},
	resolve: {
		alias: {
			$src: resolve(__dirname, './src'),
			$lib: resolve(__dirname, './src/lib'),
			$components: resolve(__dirname, './src/lib/components')
		}
	}
});
