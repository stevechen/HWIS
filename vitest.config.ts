import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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
