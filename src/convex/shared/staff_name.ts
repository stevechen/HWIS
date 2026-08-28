const CJK_IDEOGRAPHS = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

export function normalizeStaffName(name?: string | null): string {
	return (name ?? '').replace(CJK_IDEOGRAPHS, '').replace(/\s+/g, ' ').trim();
}

export function displayStaffName(name?: string | null): string {
	return normalizeStaffName(name) || 'Unknown Teacher';
}
