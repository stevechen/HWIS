import { normalizeStaffName } from '$convex/shared/staff_name';

export function cleanName(name?: string): string {
	return normalizeStaffName(name);
}

export function initials(name?: string): string {
	return (
		cleanName(name)
			.split(/\s+/)
			.map((part) => part[0]?.toUpperCase())
			.join('')
			.slice(0, 2) || '?'
	);
}
