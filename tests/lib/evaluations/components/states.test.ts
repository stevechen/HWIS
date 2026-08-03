import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EvaluationStates from '$lib/evaluations/components/EvaluationStates.svelte';

describe('EvaluationStates', () => {
	describe('Loading state', () => {
		it('shows default loading message', async () => {
			render(EvaluationStates, { state: 'loading' });
			await expect.element(page.getByText('Loading evaluations...')).toBeInTheDocument();
		});

		it('shows custom message when provided', async () => {
			render(EvaluationStates, { state: 'loading', message: 'Loading history...' });
			await expect.element(page.getByText('Loading history...')).toBeInTheDocument();
		});

		it('passes testId to container', async () => {
			render(EvaluationStates, { state: 'loading', testId: 'loading-state' });
			await expect.element(page.getByTestId('loading-state')).toBeInTheDocument();
		});
	});

	describe('Error state', () => {
		it('shows error message', async () => {
			render(EvaluationStates, { state: 'error', errorMessage: 'Network error occurred' });
			await expect.element(page.getByText('Network error occurred')).toBeInTheDocument();
		});

		it('shows error prefix text', async () => {
			render(EvaluationStates, { state: 'error', errorMessage: 'Test error' });
			await expect.element(page.getByText(/Error loading evaluations:/)).toBeInTheDocument();
		});

		it('passes testId to container', async () => {
			render(EvaluationStates, { state: 'error', errorMessage: 'err', testId: 'error-state' });
			await expect.element(page.getByTestId('error-state')).toBeInTheDocument();
		});
	});

	describe('Empty state', () => {
		it('shows default message', async () => {
			render(EvaluationStates, { state: 'empty' });
			await expect.element(page.getByText('No evaluations found.')).toBeInTheDocument();
		});

		it('shows custom message when provided', async () => {
			render(EvaluationStates, {
				state: 'empty',
				message: 'No evaluations match your search criteria.'
			});
			await expect
				.element(page.getByText('No evaluations match your search criteria.'))
				.toBeInTheDocument();
		});

		it('renders children when provided', async () => {
			render(EvaluationStates, { state: 'empty', message: 'Empty' });
			await expect.element(page.getByText('Empty')).toBeInTheDocument();
		});

		it('passes testId to container', async () => {
			render(EvaluationStates, { state: 'empty', testId: 'empty-state' });
			await expect.element(page.getByTestId('empty-state')).toBeInTheDocument();
		});
	});
});
