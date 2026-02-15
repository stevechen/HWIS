import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FilterSummaryToast from '$lib/evaluations/components/FilterSummaryToast.svelte';

describe('FilterSummaryToast Component', () => {
	describe('Visibility', () => {
		it('shows when show is true', async () => {
			render(FilterSummaryToast, { show: true, count: 5 });
			await expect.element(page.getByText(/Showing/)).toBeInTheDocument();
		});

		it('hides when show is false', async () => {
			render(FilterSummaryToast, { show: false, count: 5 });
			await expect.element(page.getByText(/Showing/)).not.toBeInTheDocument();
		});
	});

	describe('Count Display', () => {
		it('shows count only when no total provided', async () => {
			render(FilterSummaryToast, { show: true, count: 5 });
			await expect.element(page.getByText('Showing 5 evaluations')).toBeInTheDocument();
		});

		it('shows singular "evaluation" for count of 1', async () => {
			render(FilterSummaryToast, { show: true, count: 1 });
			await expect.element(page.getByText('Showing 1 evaluation')).toBeInTheDocument();
		});

		it('shows plural "evaluations" for count > 1', async () => {
			render(FilterSummaryToast, { show: true, count: 3 });
			await expect.element(page.getByText('Showing 3 evaluations')).toBeInTheDocument();
		});
	});

	describe('Total Count Display', () => {
		it('shows count of total when total provided', async () => {
			render(FilterSummaryToast, { show: true, count: 3, total: 10 });
			await expect.element(page.getByText('Showing 3 of 10 evaluations')).toBeInTheDocument();
		});

		it('shows singular for total of 1', async () => {
			render(FilterSummaryToast, { show: true, count: 1, total: 1 });
			await expect.element(page.getByText('Showing 1 of 1 evaluation')).toBeInTheDocument();
		});
	});

	describe('Filter Value Display', () => {
		it('shows filter value when provided', async () => {
			render(FilterSummaryToast, { show: true, count: 3, filterValue: 'Alice' });
			await expect.element(page.getByText(/matching.*"Alice"/)).toBeInTheDocument();
		});

		it('shows filter with custom label', async () => {
			render(FilterSummaryToast, {
				show: true,
				count: 3,
				filterLabel: 'teacher',
				filterValue: 'Johnson'
			});
			await expect.element(page.getByText(/matching teacher "Johnson"/)).toBeInTheDocument();
		});

		it('shows filter value with total', async () => {
			render(FilterSummaryToast, {
				show: true,
				count: 3,
				total: 10,
				filterLabel: 'student',
				filterValue: 'Bob'
			});
			await expect.element(page.getByText(/for student "Bob"/)).toBeInTheDocument();
		});
	});
});
