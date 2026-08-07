export function getWeekNumber(timestamp: number): number {
	const date = new Date(timestamp);
	const start = new Date(date.getFullYear(), 0, 1);
	const diff = date.getTime() - start.getTime();
	const oneWeek = 604800000;
	return Math.floor(diff / oneWeek) + 1;
}

export function formatDateRange(mondayTimestamp: number): string {
	const monday = new Date(mondayTimestamp);
	const friday = new Date(monday);
	friday.setDate(monday.getDate() + 4);

	const mondayStr = monday.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
	const fridayStr = friday.toLocaleDateString('en-US', {
		month: 'short',
		day: '2-digit',
		year: 'numeric'
	});

	return `${mondayStr} - ${fridayStr}`;
}

export function matchesMultiSearch(filter: string, value: string): boolean {
	if (!filter.trim()) return true;
	const searchTerms = filter
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	if (searchTerms.length === 0) return true;
	return searchTerms.some((term) => value.toLowerCase().includes(term));
}
