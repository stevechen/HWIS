export { cleanName, initials } from '$lib/utils/names';

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
