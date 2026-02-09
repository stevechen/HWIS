export function getTestSuffix(testName: string): string {
	const workerId = process.env.PLAYWRIGHT_WORKER_INDEX || '0';
	return `${testName}_${workerId}_${Date.now().toString().slice(-6)}_${Math.random().toString(36).substring(2, 6)}`;
}

export function getStudentId(suffix: string): string {
	return `${suffix}`;
}

export function getCategoryName(suffix: string): string {
	return `Category_${suffix}`;
}

export function getUniqueTag(prefix: string): string {
	// Generate a unique tag for test data isolation
	const workerId = process.env.PLAYWRIGHT_WORKER_INDEX || '0';
	return `${prefix}_${workerId}_${Date.now().toString().slice(-6)}_${Math.random().toString(36).substring(2, 6)}`;
}
