import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [],
		loading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

import CategoriesPage from '$src/routes/admin/categories/+page.svelte';

describe('Categories Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders page title as heading', async () => {
		render(CategoriesPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('heading', { name: 'Categories' })).toBeInTheDocument();
	});

	it('renders add category button', async () => {
		render(CategoriesPage, { props: { data: { testRole: 'admin' } } });
		await expect
			.element(page.getByRole('button', { name: 'Add new category' }))
			.toBeInTheDocument();
	});

	it('shows back to admin button', async () => {
		render(CategoriesPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('button', { name: 'Back to Admin' })).toBeInTheDocument();
	});

	it('opens add category form dialog', async () => {
		render(CategoriesPage, { props: { data: { testRole: 'admin' } } });
		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Add New Category' }))
			.toBeInTheDocument();
	});

	it('shows category name input in form', async () => {
		render(CategoriesPage, { props: { data: { testRole: 'admin' } } });
		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect.element(page.getByRole('textbox', { name: 'Category name' })).toBeInTheDocument();
	});

	it('shows sub-category input in form', async () => {
		render(CategoriesPage, { props: { data: { testRole: 'admin' } } });
		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect.element(page.getByPlaceholder('Add sub-category')).toBeInTheDocument();
	});

	it('shows save and cancel buttons in form', async () => {
		render(CategoriesPage, { props: { data: { testRole: 'admin' } } });
		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('closes dialog when cancel is clicked', async () => {
		render(CategoriesPage, { props: { data: { testRole: 'admin' } } });
		await page.getByRole('button', { name: 'Add new category' }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Add New Category' }))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Add New Category' }))
			.not.toBeInTheDocument();
	});
});
