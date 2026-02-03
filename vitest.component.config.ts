import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
	test: {
		// Component tests in tests/ folder - use browser pool
		include: ['tests/**/*.test.ts'],
		exclude: ['**/node_modules/**', 'tests/lib/**'],
		pool: 'browser'
	},
	resolve: {
		alias: {
			$src: resolve(__dirname, './src'),
			$lib: resolve(__dirname, './src/lib'),
			$components: resolve(__dirname, './src/lib/components')
		}
	}
});
