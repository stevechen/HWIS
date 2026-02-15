import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EvaluationsEmptyState from '$lib/evaluations/components/EvaluationsEmptyState.svelte';
import EvaluationsErrorState from '$lib/evaluations/components/EvaluationsErrorState.svelte';
import EvaluationsLoadingState from '$lib/evaluations/components/EvaluationsLoadingState.svelte';

describe('Evaluation States', () => {
	describe('EvaluationsEmptyState', () => {
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

	describe('EvaluationsErrorState', () => {
		describe('Rendering', () => {
			it('shows error message', async () => {
				render(EvaluationsErrorState, { message: 'Network error occurred' });
				await expect.element(page.getByText('Network error occurred')).toBeInTheDocument();
			});

			it('shows error prefix text', async () => {
				render(EvaluationsErrorState, { message: 'Test error' });
				await expect.element(page.getByText(/Error loading evaluations:/)).toBeInTheDocument();
			});
		});
	});

	describe('EvaluationsLoadingState', () => {
		describe('Rendering', () => {
			it('shows default loading message', async () => {
				render(EvaluationsLoadingState);
				await expect.element(page.getByText('Loading evaluations...')).toBeInTheDocument();
			});

			it('shows custom message when provided', async () => {
				render(EvaluationsLoadingState, { message: 'Loading history...' });
				await expect.element(page.getByText('Loading history...')).toBeInTheDocument();
			});
		});
	});
});
