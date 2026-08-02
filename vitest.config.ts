import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/convex/*.test.ts'],
		exclude: ['**/node_modules/**'],
		environment: 'edge-runtime',
		server: {
			deps: { inline: ['convex-test'] }
		},
		coverage: {
			provider: 'istanbul',
			all: true,
			include: ['src/convex/**/*.{ts,js}'],
			exclude: ['src/convex/_generated/**', 'src/convex/**/*.test.ts', 'node_modules/**'],
			reportsDirectory: 'coverage/convex'
		}
	}
});
