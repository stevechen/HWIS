/**
 * Auth Mock Helper for Testing
 *
 * Placeholder module for auth mocking utilities.
 * TODO: Implement proper mocking infrastructure for tests.
 */

export async function waitForHydration(): Promise<void> {
	// Wait for body to have 'hydrated' class
	try {
		await document.querySelector('body.hydrated');
	} catch {
		// Ignore errors - function is a placeholder
	}
}

export async function waitForLoading(): Promise<void> {
	// Placeholder - wait for loading to complete
}

export async function isModalVisible(modalText?: string): Promise<boolean> {
	// Placeholder - check if modal is visible
	return false;
}

export function mockConvexUser(user: unknown): void {
	// Placeholder - mock Convex user query
}

export function mockAuthSession(user: unknown): void {
	// Placeholder - mock auth session
}
