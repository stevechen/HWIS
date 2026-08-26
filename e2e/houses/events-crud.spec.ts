import { test, expect } from '../fixtures';
import { getTestSuffix } from '../helpers';
import {
	cleanupByTag,
	createStudent,
	createCategory,
	tagHouseEventsByTitle
} from '../convex-client';
import { HouseEventsPage } from '../pages';

test.describe('House Events Management - E2E @sequential', () => {
	test.use({ role: 'admin' });

	let suffix: string;
	let e2eTag: string;
	let eventsPage: HouseEventsPage;

	test.beforeEach(async ({ page }) => {
		eventsPage = new HouseEventsPage(page);
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
		await tagHouseEventsByTitle(suffix, e2eTag);
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

	test('New Event opens a blank create form after an edit', async () => {
		// Create event A
		const firstTitle = `First Event ${suffix}`;
		await eventsPage.startAddEvent();
		await eventsPage.fillEventForm({
			title: firstTitle,
			startDate: '2024-01-01',
			endDate: '2024-01-10'
		});
		await eventsPage.submitEvent();
		await eventsPage.expectEventVisible(firstTitle);

		// Edit event A so edit-mode state is set
		await eventsPage.editEvent(firstTitle);
		await eventsPage.cancelEvent();

		// New Event must open a blank create form, not the edited event
		await eventsPage.startAddEvent();
		await eventsPage.expectCreateMode();

		// Create event B back-to-back; both must exist
		const secondTitle = `Second Event ${suffix}`;
		await eventsPage.fillEventForm({
			title: secondTitle,
			startDate: '2024-02-01',
			endDate: '2024-02-10'
		});
		await eventsPage.submitEvent();

		await eventsPage.expectEventVisible(firstTitle);
		await eventsPage.expectEventVisible(secondTitle);
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
		await expect(eventsPage.page.getByTestId('house-events.new-event-button')).toBeVisible();

		// Verify deleted
		await eventsPage.expectEventNotVisible(deleteTitle);
	});
});
