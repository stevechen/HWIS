import { describe, it, expect } from 'vitest';
import {
	computeAuthRedirect,
	toAuthState,
	validateCallbackUrl,
	type AuthState
} from '$lib/auth-guard';
import type { SessionStatus } from '$lib/viewer-core';

const url = (pathname: string, search = '') => new URL(`${pathname}${search}`, 'http://localhost');

describe('computeAuthRedirect', () => {
	const unauthSettled: AuthState = { isLoading: false, isAuthenticated: false };
	const authSettled: AuthState = { isLoading: false, isAuthenticated: true };
	const loading: AuthState = { isLoading: true, isAuthenticated: false };

	it('returns null while auth is still loading', () => {
		expect(computeAuthRedirect(url('/admin'), loading)).toBeNull();
	});

	it('returns null when authenticated', () => {
		expect(computeAuthRedirect(url('/admin'), authSettled)).toBeNull();
	});

	it('returns null on the login page when unauthenticated', () => {
		expect(computeAuthRedirect(url('/login'), unauthSettled)).toBeNull();
	});

	it('redirects an unauthenticated user to /login with the current path as callbackUrl', () => {
		expect(computeAuthRedirect(url('/admin'), unauthSettled)).toBe('/login?callbackUrl=%2Fadmin');
	});

	it('includes search params in the callbackUrl', () => {
		expect(computeAuthRedirect(url('/evaluations', '?status=pending'), unauthSettled)).toBe(
			'/login?callbackUrl=%2Fevaluations%3Fstatus%3Dpending'
		);
	});
});

describe('toAuthState', () => {
	const cases: Array<[SessionStatus, AuthState]> = [
		['loading', { isLoading: true, isAuthenticated: false }],
		['signedOut', { isLoading: false, isAuthenticated: false }],
		['pending', { isLoading: false, isAuthenticated: true }],
		['active', { isLoading: false, isAuthenticated: true }]
	];

	it.each(cases)('maps status %s to the expected auth state', (status, expected) => {
		expect(toAuthState(status)).toEqual(expected);
	});
});

describe('validateCallbackUrl', () => {
	it('returns "/" for a missing callbackUrl', () => {
		expect(validateCallbackUrl(null)).toBe('/');
	});

	it('returns a safe relative path unchanged', () => {
		expect(validateCallbackUrl('/admin')).toBe('/admin');
		expect(validateCallbackUrl('/evaluations?status=pending')).toBe('/evaluations?status=pending');
	});

	it('blocks absolute URLs and protocol-relative URLs to prevent open redirect', () => {
		expect(validateCallbackUrl('https://evil.example')).toBe('/');
		expect(validateCallbackUrl('//evil.example')).toBe('/');
		expect(validateCallbackUrl('http://evil.example/admin')).toBe('/');
	});
});
