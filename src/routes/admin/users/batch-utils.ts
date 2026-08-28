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

export function isNewPending(u: { status?: string; deactivatedAt?: number }): boolean {
	return u.status === 'pending' && !u.deactivatedAt;
}

export function timeAgo(ts: number): string {
	const days = Math.floor((Date.now() - ts) / 86400000);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	return `${days} days ago`;
}

export function formatDate(ts: number): string {
	return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
