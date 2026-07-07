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

		browser: {
			enabled: true,
			api: {
				host: '127.0.0.1'
			},
			provider: playwright(),
			instances: [{ browser: 'chromium', headless: true }]
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
