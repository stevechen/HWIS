import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { resolve } from 'path';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],

	resolve: {
		alias: {
			$tests: resolve(__dirname, 'tests'),
			$src: resolve(__dirname, 'src')
		}
	},

	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',

				test: {
					name: 'client',

					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},

					include: ['tests/**/*.test.ts'],
					exclude: ['tests/e2e/**', 'tests/lib/server/**', 'src/convex/**', 'src/lib/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},

			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					environment: 'node',
					include: ['src/convex/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'tests/**']
				}
			}
		]
	}
});
