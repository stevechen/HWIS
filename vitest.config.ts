import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		exclude: ['e2e/**', '**/node_modules/**'],
		environmentMatchGlobs: [
			['convex/**', 'edge-runtime'],
			['**', 'jsdom']
		],
		server: {
			deps: { inline: ['convex-test'] }
		}
	}
});
