import { describe, it, expect, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import { page } from 'vite-plus/test/browser';
import UsersPage from '$src/routes/esl/admin/users/+page.svelte';

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: () => ({
		viewer: { _id: 'actor-id', role: 'super' },
		isEslAdmin: true
	})
}));

describe('ESL admin users delete button', () => {
	it('shows delete button for super users', async () => {
		render(UsersPage);
		await expect.element(page.getByTestId('esl-admin-users.delete')).toBeInTheDocument();
	});
});
