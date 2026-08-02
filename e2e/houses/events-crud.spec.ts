import { test, expect } from '../fixtures';
import { getTestSuffix } from '../helpers';
import {
	cleanupByTag,
	cleanupAllHouseEvents,
	createStudent,
	createCategory
} from '../convex-client';
import { HousesEventsPage } from '../pages';

test.describe('House Events Management - E2E @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let e2eTag: string;
	let eventsPage: HousesEventsPage;

	test.beforeEach(async ({ page }) => {
		eventsPage = new HousesEventsPage(page);
		suffix = getTestSuffix('events');
		e2eTag = `e2e-events-${suffix}`;

		// Seed some data for context
		await createStudent({
			studentId: `STU_EVT_${suffix}`,
			englishName: `TestStudent_${suffix}`,
			chineseName: '測試生',
			grade: 9,
			status: 'Enrolled',
			e2eTag
		});

		await createCategory({
			name: `TestCat_${suffix}`,
			e2eTag
		});

		await eventsPage.goto();
	});

	test.afterEach(async () => {
		await cleanupAllHouseEvents();
		await cleanupByTag('all', e2eTag);
	});

	test('can create new event with house points', async () => {
		await eventsPage.startAddEvent();

		const eventTitle = `Test Event ${suffix}`;
		await eventsPage.fillEventForm({
			title: eventTitle,
			startDate: '2024-01-01',
			endDate: '2024-01-15',
			points: { Heracles: '10', Wukong: '5' }
		});
		await eventsPage.submitEvent();

		await eventsPage.expectEventVisible(eventTitle);
	});

	test('can edit existing event', async () => {
		// First create an event
		const originalTitle = `Original Event ${suffix}`;
		const updatedTitle = `Updated Event ${suffix}`;
		await eventsPage.startAddEvent();
		await eventsPage.fillEventForm({
			title: originalTitle,
			startDate: '2024-01-01',
			endDate: '2024-01-10'
		});
		await eventsPage.submitEvent();

		await eventsPage.expectEventVisible(originalTitle);

		// Edit the event
		await eventsPage.editEvent(originalTitle);
		await eventsPage.fillEventForm({
			title: updatedTitle,
			startDate: '2024-01-01',
			endDate: '2024-01-10'
		});
		await eventsPage.submitEvent();

		// Verify update
		await eventsPage.expectEventVisible(updatedTitle);
	});

	test('can delete event', async () => {
		// Create event
		const deleteTitle = `ToDelete Event ${suffix}`;
		await eventsPage.startAddEvent();
		await eventsPage.fillEventForm({
			title: deleteTitle,
			startDate: '2024-01-01',
			endDate: '2024-01-10'
		});
		await eventsPage.submitEvent();

		await eventsPage.expectEventVisible(deleteTitle);

		// Delete the event
		await eventsPage.deleteEvent(deleteTitle);

		// Reload to ensure data is refreshed
		await eventsPage.page.reload();
		await eventsPage.page.waitForSelector('body.hydrated');
		await expect(eventsPage.page.getByTestId('houses.new-event-button')).toBeVisible();

		// Verify deleted
		await eventsPage.expectEventNotVisible(deleteTitle);
	});
});
