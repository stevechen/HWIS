import { getE2EUtils } from '../src/lib/e2e-utils';

async function withRecoveryRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (attempt === 3) {
				console.error(`[e2e-recovery] ${label} failed after ${attempt} attempts`, error);
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
		}
	}
	throw lastError;
}

/** Recovery-only operations. Never call these from a parallel test body. */
export async function teardownAllTagged() {
	return await withRecoveryRetry('teardownAllTagged', () =>
		getE2EUtils().cleanupAllE2eTaggedData()
	);
}

export async function teardownTestUsers() {
	return await withRecoveryRetry('teardownTestUsers', () => getE2EUtils().cleanupTestUsers());
}

export async function teardownAllHouseEvents() {
	return await withRecoveryRetry('teardownAllHouseEvents', () =>
		getE2EUtils().cleanupAllHouseEvents()
	);
}
