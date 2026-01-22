import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

import RejectedPage from '$src/routes/rejected/+page.svelte';

describe('Rejected Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders access denied heading', async () => {
		render(RejectedPage);
		await expect.element(page.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
	});

	it('renders unauthorized message', async () => {
		render(RejectedPage);
		await expect.element(page.getByText('Your email domain is not authorized')).toBeInTheDocument();
	});

	it('renders sign out button', async () => {
		render(RejectedPage);
		await expect.element(page.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
	});

	it('renders HWIS website link', async () => {
		render(RejectedPage);
		await expect
			.element(page.getByRole('link', { name: 'Visit HWIS Website' }))
			.toBeInTheDocument();
	});
});
