import { Page, expect } from '@playwright/test';

export class AdminCategoriesPage {
	constructor(private page: Page) {}

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
				await expect(input).toBeVisible({ timeout: 5000 });
				await input.fill(data.meritCriteria[i]);
			}
		}

		if (data.demeritCriteria) {
			for (let i = 0; i < data.demeritCriteria.length; i++) {
				const input = this.page.getByTestId(`categories.form-dialog.demerit-${i}`);
				await expect(input).toBeVisible({ timeout: 5000 });
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
		await this.page.getByTestId('categories.form-dialog.submit').click();
		await expect(this.page.getByTestId('categories.form-dialog')).not.toBeVisible({
			timeout: 10000
		});
	}

	async cancel() {
		await this.page.getByTestId('categories.form-dialog.cancel').click();
		await expect(this.page.getByTestId('categories.form-dialog')).not.toBeVisible();
	}

	async expectCategoryVisible(name: string) {
		await expect(this.page.getByRole('cell', { name })).toBeVisible();
	}

	async editCategory(oldName: string, newData: { name: string }) {
		await this.page.getByTestId(`categories.table.edit-${oldName}`).click();
		await expect(this.page.getByTestId('categories.form-dialog')).toBeVisible();
		await this.page.getByTestId('categories.form-dialog.name').fill(newData.name);
		await this.submit();
	}

	async deleteCategory(name: string) {
		await this.page.getByTestId(`categories.table.delete-${name}`).click();
		await expect(this.page.getByTestId('categories.delete-dialog')).toBeVisible();
		await this.page.getByTestId('categories.delete-dialog.delete').click();
		await expect(this.page.getByTestId('categories.delete-dialog')).not.toBeVisible();
	}
}
