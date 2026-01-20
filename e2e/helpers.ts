export function getTestSuffix(testName: string): string {
	return `${testName}_${Date.now().toString().slice(-6)}_${Math.random().toString(36).substring(2, 6)}`;
}

export function getStudentId(suffix: string): string {
	return `${suffix}`;
}

export function getCategoryName(suffix: string): string {
	return `Category_${suffix}`;
}
