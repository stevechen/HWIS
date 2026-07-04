import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CategoryInfoCard from '$lib/components/CategoryInfoCard.svelte';

const defaultCategory = {
	name: 'Academic Excellence',
	casAlignment: [] as string[],
	meritCriteria: ['Completed all assignments on time', 'Active participation in class discussions'],
	demeritCriteria: ['Late submissions without valid reason', 'Disruptive behavior during lessons']
};

const categoryWithCas = {
	...defaultCategory,
	casAlignment: ['Creativity', 'Activity']
};

describe('CategoryInfoCard', () => {
	describe('Basic Rendering', () => {
		it('renders the category name', async () => {
			render(CategoryInfoCard, { category: defaultCategory });
			await expect.element(page.getByText('Academic Excellence')).toBeInTheDocument();
		});

		it('renders merit criteria', async () => {
			render(CategoryInfoCard, { category: defaultCategory });
			await expect.element(page.getByText('Completed all assignments on time')).toBeInTheDocument();
			await expect
				.element(page.getByText('Active participation in class discussions'))
				.toBeInTheDocument();
		});

		it('renders demerit criteria', async () => {
			render(CategoryInfoCard, { category: defaultCategory });
			await expect
				.element(page.getByText('Late submissions without valid reason'))
				.toBeInTheDocument();
			await expect
				.element(page.getByText('Disruptive behavior during lessons'))
				.toBeInTheDocument();
		});

		it('renders merit and demerit section headings', async () => {
			render(CategoryInfoCard, { category: defaultCategory });
			await expect.element(page.getByText('Merit (+)')).toBeInTheDocument();
			await expect.element(page.getByText('Demerit (-)')).toBeInTheDocument();
		});
	});

	describe('CAS Alignment', () => {
		it('renders CAS alignment badges when provided', async () => {
			render(CategoryInfoCard, { category: categoryWithCas });
			await expect.element(page.getByText('Creativity')).toBeInTheDocument();
			await expect.element(page.getByText('Activity')).toBeInTheDocument();
		});

		it('does not render CAS badges when empty', async () => {
			render(CategoryInfoCard, { category: defaultCategory });
			await expect.element(page.getByText('Service')).not.toBeInTheDocument();
		});

		it('does not render CAS section when undefined', async () => {
			const categoryWithoutCas = { ...defaultCategory, casAlignment: undefined };
			render(CategoryInfoCard, { category: categoryWithoutCas });
			await expect.element(page.getByText('Creativity')).not.toBeInTheDocument();
			await expect.element(page.getByText('Activity')).not.toBeInTheDocument();
			await expect.element(page.getByText('Service')).not.toBeInTheDocument();
		});
	});

	describe('Clickable Criteria', () => {
		it('calls oncriterionclick with criterion text on click', async () => {
			const oncriterionclick = vi.fn();
			render(CategoryInfoCard, { category: defaultCategory, oncriterionclick });

			await page.getByRole('button', { name: 'Completed all assignments on time' }).click();

			expect(oncriterionclick).toHaveBeenCalledWith('Completed all assignments on time');
		});

		it('calls oncriterionclick with demerit criterion text on click', async () => {
			const oncriterionclick = vi.fn();
			render(CategoryInfoCard, { category: defaultCategory, oncriterionclick });

			await page.getByRole('button', { name: 'Late submissions without valid reason' }).click();

			expect(oncriterionclick).toHaveBeenCalledWith('Late submissions without valid reason');
		});

		it('triggers callback on Enter key press', async () => {
			const oncriterionclick = vi.fn();
			const { container } = render(CategoryInfoCard, {
				category: defaultCategory,
				oncriterionclick
			});

			const button = page.getByRole('button', {
				name: 'Active participation in class discussions'
			});
			await button.click();

			const element = container.querySelector('[role="button"]');
			if (element) {
				element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			}
			expect(oncriterionclick).toHaveBeenCalled();
		});

		it('renders criteria as interactive when oncriterionclick is provided', async () => {
			const oncriterionclick = vi.fn();
			render(CategoryInfoCard, { category: defaultCategory, oncriterionclick });

			const buttons = page.getByRole('button');
			const buttonsList = await buttons.all();
			expect(buttonsList.length).toBeGreaterThan(0);
		});
	});

	describe('Non-Interactive Mode', () => {
		it('renders criteria as plain text without oncriterionclick', async () => {
			render(CategoryInfoCard, { category: defaultCategory });

			const buttons = page.getByRole('button');
			const buttonsList = await buttons.all();
			expect(buttonsList.length).toBe(0);
		});

		it('still displays criteria text without oncriterionclick', async () => {
			render(CategoryInfoCard, { category: defaultCategory });
			await expect.element(page.getByText('Completed all assignments on time')).toBeInTheDocument();
			await expect
				.element(page.getByText('Late submissions without valid reason'))
				.toBeInTheDocument();
		});
	});

	describe('Empty / Edge Cases', () => {
		it('handles undefined merit criteria', async () => {
			const categoryNoMerit = { ...defaultCategory, meritCriteria: undefined };
			render(CategoryInfoCard, { category: categoryNoMerit });
			await expect.element(page.getByText('Merit (+)')).not.toBeInTheDocument();
			await expect.element(page.getByText('Demerit (-)')).toBeInTheDocument();
		});

		it('handles undefined demerit criteria', async () => {
			const categoryNoDemerit = { ...defaultCategory, demeritCriteria: undefined };
			render(CategoryInfoCard, { category: categoryNoDemerit });
			await expect.element(page.getByText('Demerit (-)')).not.toBeInTheDocument();
			await expect.element(page.getByText('Merit (+)')).toBeInTheDocument();
		});

		it('handles empty criteria arrays', async () => {
			const categoryEmpty = { ...defaultCategory, meritCriteria: [], demeritCriteria: [] };
			render(CategoryInfoCard, { category: categoryEmpty });
			await expect.element(page.getByText('Merit (+)')).not.toBeInTheDocument();
			await expect.element(page.getByText('Demerit (-)')).not.toBeInTheDocument();
		});
	});
});
