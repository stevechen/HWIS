import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EslPage from '$src/routes/esl/+page.svelte';

describe('esl dashboard page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders department title and section tiles', async () => {
		render(EslPage);

		await expect.element(page.getByTestId('esl-dashboard.title')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.schedule')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.calendar')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.slips')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.zipgrade')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.admin')).toBeInTheDocument();
	});
});
