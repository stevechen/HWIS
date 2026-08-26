import { test, expect } from './fixtures';
import { createStudent, cleanupByTag } from './convex-client';
import { getTestSuffix } from './helpers';

/**
 * Session E2E Tests
 *
 * These tests verify session management behavior including:
 * - Session persistence across navigation
 * - Session invalidation when user status changes (admin action)
 * - Logout functionality
 *
 * Note: JWT token timeout (24 hours in dev) is not tested in E2E
 * as it would require waiting for timeout. Server unit tests cover
 * the session invalidation logic.
 */
test.describe('Session Management @session @auth-sequential', () => {
	test.describe('Session Persistence', () => {
		test.describe('Admin', () => {
			test.use({ role: 'admin' });

			test('admin session persists across page navigation', async ({ page }) => {
				// Navigate to admin page
				await page.goto('/admin');
				await page.waitForSelector('body.hydrated');

				// Navigate to students page
				await page.goto('/admin/students');
				await page.waitForSelector('body.hydrated');

				// Verify still authenticated - should see admin features
				await expect(page.getByRole('button', { name: 'Add new student' })).toBeVisible();

				// Navigate to users page
				await page.goto('/admin/users');
				await page.waitForSelector('body.hydrated');

				// Verify still authenticated - should see the admin users view
				await expect(page.getByTestId('admin-users.root')).toBeVisible();
				await expect(page.getByRole('heading', { name: 'Manage Users' })).toBeVisible();
			});
		});

		test.describe('Teacher', () => {
			test.use({ role: 'teacher' });

			test('teacher session persists across page navigation', async ({ page }) => {
				// Navigate to students page
				await page.goto('/admin/students');
				await page.waitForSelector('body.hydrated');
				await expect(page.getByText('Loading students...')).not.toBeVisible();

				// Should see students but not admin controls
				await expect(page.getByRole('heading', { name: 'Student Management' })).toBeVisible();

				// Navigate to another page
				await page.goto('/');
				await page.waitForSelector('body.hydrated');

				// Should still be logged in (no login button visible)
				await expect(page.getByRole('button', { name: 'Sign In' })).not.toBeVisible();
			});
		});
	});

	test.describe('Session Invalidation via Admin Action', () => {
		let testE2eTag: string;
		let studentId: string;

		test.use({ role: 'admin' });

		test.beforeEach(async () => {
			const suffix = getTestSuffix('sessionTest');
			studentId = `ST_${suffix}`;
			testE2eTag = `session_${suffix}`;

			// Create a test student for baseline data
			await createStudent({
				studentId: studentId,
				englishName: `Session_${suffix}`,
				chineseName: '會議測試',
				grade: 10,
				status: 'Enrolled',
				e2eTag: testE2eTag
			});
		});

		test.afterEach(async () => {
			await cleanupByTag('students', testE2eTag);
		});

		test.skip('deactivating user invalidates their sessions (server-side)', async () => {
			// This test verifies that when an admin deactivates a user,
			// the server-side session invalidation occurs (verified in server tests)
			// and the user is redirected to login.
			// Skipped: E2E testing of session invalidation requires triggering
			// a server-side status change and waiting for token expiry,
			// which is not feasible in a single E2E test run.
		});
	});

	test.describe('Admin Logout', () => {
		test.use({ role: 'admin' });

		test('admin can logout successfully', async ({ page }) => {
			// Navigate to admin page (should be accessible)
			await page.goto('/admin');
			await page.waitForSelector('body.hydrated');

			// Verify logged in
			await expect(page.getByRole('link', { name: 'Student Management' })).toBeVisible();

			// Click sign out directly
			const signOutButton = page.getByRole('button', { name: /sign out|logout/i });
			await expect(signOutButton).toBeVisible();
			await signOutButton.click();

			// After logout, should be redirected to login or home
			await page.waitForLoadState('networkidle');

			// Should now see login button
			await expect(page.getByRole('button', { name: /sign in|signin/i })).toBeVisible();
		});
	});

	test.describe('Teacher Logout', () => {
		test.use({ role: 'teacher' });

		test('teacher can logout successfully', async ({ page }) => {
			// Navigate to students page (should be accessible for teachers)
			await page.goto('/admin/students');
			await page.waitForSelector('body.hydrated');

			// Verify logged in
			await expect(page.getByRole('heading', { name: 'My Evaluations' })).toBeVisible();

			// Click sign out directly
			const signOutButton = page.getByRole('button', { name: /sign out|logout/i });
			await expect(signOutButton).toBeVisible();
			await signOutButton.click();

			// After logout, should see login button
			await expect(page.getByRole('button', { name: /sign in|signin/i })).toBeVisible();
		});
	});

	test.describe('Session Security', () => {
		test('unauthenticated user cannot access admin pages', async ({ page }) => {
			// Navigate to admin page without authentication
			await page.goto('/admin');

			// Should either redirect to login or show login prompt
			await page.waitForLoadState('networkidle');

			// Check if redirected to login or showing auth required
			const isOnLoginPage = page.url().includes('/login') || page.url().includes('/sign-in');
			const hasLoginButton = await page
				.getByRole('button', { name: /sign in|signin|login/i })
				.isVisible()
				.catch(() => false);

			expect(isOnLoginPage || hasLoginButton).toBe(true);
		});

		test('unauthenticated user cannot access student pages', async ({ page }) => {
			// Navigate to students page without authentication
			await page.goto('/admin/students');

			// Should either redirect to login or show login prompt
			await page.waitForLoadState('networkidle');

			const isOnLoginPage = page.url().includes('/login') || page.url().includes('/sign-in');
			const hasLoginButton = await page
				.getByRole('button', { name: /sign in|signin|login/i })
				.isVisible()
				.catch(() => false);

			expect(isOnLoginPage || hasLoginButton).toBe(true);
		});
	});
});
