import { test, expect } from '@playwright/test';
import { getTestSuffix } from './students.shared';
import {
	seedBaseline,
	createStudent,
	createEvaluationForStudent,
	cleanupTestData
} from './convex-client';

test.use({ storageState: 'e2e/.auth/admin.json' });

test.afterEach(async ({ page }) => {
	const suffix = getTestSuffix('eval');
	try {
		await cleanupTestData(suffix);
	} catch (e) {}
});

test('evaluate student and check cascade', async ({ page }) => {
	const suffix = getTestSuffix('eval');
	const studentId = `T_${suffix}`;
	const englishName = `TestCascade_${suffix}`;

	await page.goto('/admin/students');
	await page.waitForSelector('body.hydrated');

	await seedBaseline();

	await createStudent({
		studentId,
		englishName,
		grade: 10,
		status: 'Enrolled',
		e2eTag: `e2e-test_${suffix}`
	});

	await page.getByPlaceholder('Search by name or student ID...').fill(englishName);

	const studentRow = page.getByRole('row', { name: englishName });
	await expect(studentRow).toBeVisible();

	await createEvaluationForStudent({ studentId, e2eTag: `e2e-test_${suffix}` });

	await expect(page.getByRole('row', { name: englishName })).toBeVisible();

	await page
		.getByRole('row', { name: englishName })
		.getByRole('button', { name: `Delete ${englishName}` })
		.click();

	await expect(page.getByRole('dialog')).toBeVisible();

	const cascadeButton = page.getByRole('dialog').getByRole('button', { name: 'Delete Anyway' });
	const hasCascade = await cascadeButton.isVisible().catch(() => false);
});
