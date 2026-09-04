import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import IstanbulPlugin from 'vite-plugin-istanbul';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { resolve } from 'path';
import type { PluginOption } from 'vite';

const enableIstanbul = process.env.VITE_COVERAGE === 'true';

const plugins: PluginOption[] = [tailwindcss(), sveltekit(), devtoolsJson()];

if (enableIstanbul) {
	plugins.push(
		IstanbulPlugin({
			cwd: resolve(__dirname),
			include: 'src/**',
			exclude: ['node_modules', '.svelte-kit', 'tests', 'scripts', 'src/lib/components/ui/**'],
			extension: ['.js', '.ts', '.svelte']
		})
	);
}

export default defineConfig({
	plugins,

	resolve: {
		alias: {
			$tests: resolve(__dirname, 'tests'),
			$src: resolve(__dirname, 'src')
		},
		// Ensure a single instance of @internationalized/date, otherwise instanceof
		// checks in bits-ui (e.g. getDateValueType) fail with "Unknown date type".
		dedupe: ['@internationalized/date']
	},

	test: {
		expect: { requireAssertions: true },
		testTimeout: 20000,
		hookTimeout: 20000,
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
			},

			{
				extends: './vite.config.ts',

				test: {
					name: 'scripts',
					environment: 'node',
					include: ['scripts/**/*.test.ts']
				}
			}
		]
	}
});
