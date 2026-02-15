import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EvaluationsEmptyState from '$lib/evaluations/components/EvaluationsEmptyState.svelte';

describe('EvaluationsEmptyState Component', () => {
	describe('Rendering', () => {
		it('shows default message', async () => {
			render(EvaluationsEmptyState);
			await expect.element(page.getByText('No evaluations found.')).toBeInTheDocument();
		});

		it('shows custom message when provided', async () => {
			render(EvaluationsEmptyState, { message: 'No evaluations match your search criteria.' });
			await expect
				.element(page.getByText('No evaluations match your search criteria.'))
				.toBeInTheDocument();
		});
	});
});
