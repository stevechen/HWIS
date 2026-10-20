import { page } from 'vite-plus/test/browser';
import { describe, it, expect } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import EslAdminOverview from '$src/routes/esl/admin/+page.svelte';

describe('ESL admin overview', () => {
	it('links to Backup & Restore', async () => {
		await render(EslAdminOverview);

		await expect.element(page.getByTestId('esl-admin.overview.backup')).toBeInTheDocument();
		await expect
			.element(page.getByRole('link', { name: /Backup & Restore/ }))
			.toHaveAttribute('href', '/esl/admin/backup');
	});
});
