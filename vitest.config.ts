import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	resolve: {
		// The same aliases SvelteKit configures, so a test may reach a route module
		// and the shared module it imports. The workbook-reading tests need both:
		// `workbook.ts` is under `src/routes` and imports from `$convex`.
		alias: {
			$src: fileURLToPath(new URL('./src', import.meta.url)),
			$convex: fileURLToPath(new URL('./src/convex', import.meta.url))
		}
	},
	test: {
		// Vitest v4 compatibility: preserve mock call history.
		// Remove after tests no longer rely on calls from setup or earlier tests.
		// https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
		// https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
		clearMocks: false,
		include: ['src/convex/**/*.test.ts'],
		exclude: ['**/node_modules/**'],
		environment: 'edge-runtime',
		server: {
			deps: { inline: ['convex-test'] }
		},
		coverage: {
			provider: 'istanbul',
			include: ['src/convex/**/*.{ts,js}'],
			exclude: ['src/convex/_generated/**', 'src/convex/**/*.test.ts', 'node_modules/**'],
			reportsDirectory: 'coverage/convex'
		}
	}
});
