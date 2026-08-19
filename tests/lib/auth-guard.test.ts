import { describe, it, expect } from 'vitest';
import { computeAuthRedirect } from '$lib/auth-guard';

describe('computeAuthRedirect', () => {
	const unauthSettled = { isLoading: false, isAuthenticated: false };
	const authSettled = { isLoading: false, isAuthenticated: true };
	const loading = { isLoading: true, isAuthenticated: false };

	it('returns null while auth is still loading', () => {
		expect(computeAuthRedirect('/admin', '', loading)).toBeNull();
	});

	it('returns null when authenticated', () => {
		expect(computeAuthRedirect('/admin', '', authSettled)).toBeNull();
	});

	it('returns null on the login page when unauthenticated', () => {
		expect(computeAuthRedirect('/login', '', unauthSettled)).toBeNull();
	});

	it('redirects an unauthenticated user to /login with the current path as callbackUrl', () => {
		expect(computeAuthRedirect('/admin', '', unauthSettled)).toBe('/login?callbackUrl=%2Fadmin');
	});

	it('includes search params in the callbackUrl', () => {
		expect(computeAuthRedirect('/evaluations', '?status=pending', unauthSettled)).toBe(
			'/login?callbackUrl=%2Fevaluations%3Fstatus%3Dpending'
		);
	});
});
