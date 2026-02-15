import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FilterInput from '$lib/evaluations/components/FilterInput.svelte';

describe('FilterInput Component', () => {
	describe('Rendering', () => {
		it('renders input element', async () => {
			render(FilterInput, { value: '' });
			await expect.element(page.getByRole('textbox')).toBeInTheDocument();
		});

		it('uses default placeholder when not provided', async () => {
			render(FilterInput, { value: '' });
			const input = page.getByPlaceholder('Filter...');
			await expect.element(input).toBeInTheDocument();
		});

		it('uses custom placeholder when provided', async () => {
			render(FilterInput, { value: '', placeholder: 'Search students...' });
			const input = page.getByPlaceholder('Search students...');
			await expect.element(input).toBeInTheDocument();
		});
	});

	describe('Accessibility', () => {
		it('has aria-label when provided', async () => {
			render(FilterInput, { value: '', ariaLabel: 'Filter by student name' });
			const input = page.getByRole('textbox', { name: 'Filter by student name' });
			await expect.element(input).toBeInTheDocument();
		});

		it('uses default aria-label when not provided', async () => {
			render(FilterInput, { value: '' });
			const input = page.getByRole('textbox', { name: 'Filter' });
			await expect.element(input).toBeInTheDocument();
		});
	});

	describe('Two-way Binding', () => {
		it('displays the bound value', async () => {
			render(FilterInput, { value: 'test value' });
			const input = page.getByRole('textbox');
			await expect.element(input).toHaveValue('test value');
		});
	});
});
