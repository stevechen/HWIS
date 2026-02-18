/**
 * Get short browser name for test data isolation.
 * Prevents cross-browser data collisions when projects run in parallel.
 * CR = Chromium, WK = WebKit, FF = Firefox
 */
import { randomUUID } from 'crypto';

function getProjectName(): string {
	return (
		process.env.PW_TEST_PROJECT_NAME ||
		process.env.PLAYWRIGHT_PROJECT_NAME ||
		process.env.TEST_PROJECT_NAME ||
		process.env.PROJECT_NAME ||
		process.env.PW_TEST_BROWSER_NAME ||
		process.env.PLAYWRIGHT_BROWSER_NAME ||
		''
	);
}

function getWorkerId(): string {
	return (
		process.env.PLAYWRIGHT_WORKER_INDEX ||
		process.env.PW_TEST_WORKER_INDEX ||
		process.env.TEST_WORKER_INDEX ||
		String(process.pid)
	);
}

export function getBrowserShortName(): string {
	// Try multiple sources for project name
	const project = getProjectName().toLowerCase();
	if (project.includes('webkit') || project.includes('safari') || project.includes('wk')) return 'WK';
	if (project.includes('firefox') || project.includes('ff')) return 'FF';
	if (project.includes('chromium') || project.includes('chrome') || project.includes('cr')) return 'CR';
	return 'CR'; // Default to Chromium
}

/**
 * Generate unique test suffix with browser ID for cross-browser isolation.
 * Format: {testName}_{browser}_{worker}_{timestamp}_{random}
 * Example: addCat_CR_0_123456_abc
 */
export function getTestSuffix(testName: string): string {
	const workerId = getWorkerId();
	const browserId = getBrowserShortName();
	const timestamp = Date.now().toString().slice(-6);
	const random = randomUUID().slice(0, 6);
	return `${testName}_${browserId}_${workerId}_${timestamp}_${random}`;
}

export function getStudentId(suffix: string): string {
	return `${suffix}`;
}

export function getCategoryName(suffix: string): string {
	return `Category_${suffix}`;
}

/**
 * Generate unique e2e tag for test data cleanup.
 * Format: {prefix}_{browser}_{worker}_{timestamp}_{random}
 */
export function getUniqueTag(prefix: string = 'test'): string {
	const workerId = getWorkerId();
	const browserId = getBrowserShortName();
	const timestamp = Date.now().toString().slice(-6);
	const random = randomUUID().slice(0, 6);
	return `${prefix}_${browserId}_${workerId}_${timestamp}_${random}`;
}
