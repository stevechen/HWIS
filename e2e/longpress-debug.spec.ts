import { test, expect } from '@playwright/test';
import { getTestSuffix } from '../e2e/helpers';
import { createStudentWithEvaluations, createCategory, useRole } from '../e2e/convex-client';

test.describe('long-press debug', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	const suffix = getTestSuffix('lp');
	const studentId = `LP_${suffix}`;
	const englishName = `LPDebug_${suffix}`;
	const categoryName = `LPCat_${suffix}`;

	test('try long-press on teacher page with debug', async ({ page }) => {
		useRole('teacher');
		await createCategory({ name: categoryName, e2eTag: `e2e-test_${suffix}` });
		await createStudentWithEvaluations({
			studentId,
			englishName,
			chineseName: '長按',
			grade: 10,
			status: 'Enrolled',
			categoryName,
			e2eTag: `e2e-test_${suffix}`
		});

		await page.goto('/evaluations');
		await page.waitForSelector('body.hydrated');
		await page.waitForTimeout(1000);

		// Check if card is in DOM
		const hasCard = await page.evaluate((name) => {
			const el = document.querySelector(`[aria-label="Evaluation for ${name}"]`);
			return {
				exists: el !== null,
				tagName: el?.tagName || 'none',
				className: el?.className || 'none'
			};
		}, englishName);
		console.log('Card check:', JSON.stringify(hasCard));

		if (!hasCard.exists) {
			// Check all cards
			const allCards = await page.evaluate(() => {
				return Array.from(document.querySelectorAll('[role="button"]')).map((el) => ({
					ariaLabel: el.getAttribute('aria-label'),
					className: el.className,
					tagName: el.tagName
				}));
			});
			console.log('All role="button" elements:', JSON.stringify(allCards, null, 2));
			return;
		}

		// Try dispatchEvent like existing tests
		const card = page.locator(`[aria-label="Evaluation for ${englishName}"]`);
		await expect(card).toBeVisible();

		await card.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await card.dispatchEvent('mouseup');

		const dialogVisible = await page
			.getByRole('dialog', { name: /Edit Evaluation/i })
			.isVisible()
			.catch(() => false);
		console.log('dialog visible after dispatchEvent:', dialogVisible);

		// Check if we navigated away
		console.log('current URL:', page.url());
	});
});
