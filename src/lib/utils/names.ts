import { normalizeStaffName } from '$convex/shared/staff_name';

export function cleanName(name?: string | null): string {
	return normalizeStaffName(name);
}

export function initials(name?: string | null): string {
	return (
		cleanName(name)
			.split(/\s+/)
			.map((part) => part[0]?.toUpperCase())
			.join('')
			.slice(0, 2) || '?'
	);
}
