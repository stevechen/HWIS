import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/convex/*.test.ts'],
		exclude: ['**/node_modules/**'],
		environment: 'edge-runtime',
		server: {
			deps: { inline: ['convex-test'] }
		}
	}
});
