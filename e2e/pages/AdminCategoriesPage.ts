import { Page, expect } from '@playwright/test';

export class AdminCategoriesPage {
	constructor(public page: Page) {}

	async goto() {
		await this.page.goto('/admin/categories');
		await this.page.waitForSelector('body.hydrated');
		await expect(this.page.getByTestId('categories.add-button')).toBeVisible();
	}

	async startAdd() {
		await this.page.getByTestId('categories.add-button').click();
		await expect(this.page.getByTestId('categories.form-dialog')).toBeVisible();
	}

	async fillCategoryForm(data: {
		name: string;
		casCreativity?: boolean;
		casActivity?: boolean;
		casService?: boolean;
		meritCriteria?: string[];
		demeritCriteria?: string[];
	}) {
		await this.page.getByTestId('categories.form-dialog.name').fill(data.name);

		if (data.casCreativity)
			await this.page.getByTestId('categories.form-dialog.cas-creativity').check();
		if (data.casActivity)
			await this.page.getByTestId('categories.form-dialog.cas-activity').check();
		if (data.casService) await this.page.getByTestId('categories.form-dialog.cas-service').check();

		if (data.meritCriteria) {
			for (let i = 0; i < data.meritCriteria.length; i++) {
				const input = this.page.getByTestId(`categories.form-dialog.merit-${i}`);
				await expect(input).toBeVisible();
				await input.fill(data.meritCriteria[i]);
			}
		}

		if (data.demeritCriteria) {
			for (let i = 0; i < data.demeritCriteria.length; i++) {
				const input = this.page.getByTestId(`categories.form-dialog.demerit-${i}`);
				await expect(input).toBeVisible();
				await input.fill(data.demeritCriteria[i]);
			}
		}
	}

	async addMeritCriterion() {
		await this.page.getByTestId('categories.form-dialog.merit-add').click();
	}

	async addDemeritCriterion() {
		await this.page.getByTestId('categories.form-dialog.demerit-add').click();
	}

	async submit() {
		await this.page.getByTestId('admin-categories.form.submit').click();
		await expect(this.page.getByTestId('categories.form-dialog')).not.toBeVisible();
	}

	async cancel() {
		await this.page.getByTestId('admin-categories.form.cancel').click();
		await expect(this.page.getByTestId('categories.form-dialog')).not.toBeVisible();
	}

	async expectCategoryVisible(name: string) {
		await expect(this.page.getByRole('cell', { name })).toBeVisible();
	}

	async editCategory(oldName: string, newData: { name: string }) {
		// Find the row containing the category name, then click edit button within it
		const row = this.page.locator('[data-testid^="categories.table.row-"]', {
			has: this.page.getByText(oldName)
		});
		const editButton = row.getByTestId(/^categories\.table\.edit-/);
		await expect(editButton).toBeVisible();
		await editButton.click();
		await expect(this.page.getByTestId('categories.form-dialog')).toBeVisible();
		await this.page.getByTestId('categories.form-dialog.name').fill(newData.name);
		await this.submit();
	}

	async deleteCategory(name: string) {
		const row = this.page.locator('[data-testid^="categories.table.row-"]', {
			has: this.page.getByText(name)
		});
		await row.getByTestId(/^categories\.table\.delete-/).click();
		await expect(this.page.getByTestId('categories.delete-dialog')).toBeVisible();
		await this.page.getByTestId('categories.delete-dialog.delete').click();
		await expect(this.page.getByTestId('categories.delete-dialog')).not.toBeVisible();
	}
}
