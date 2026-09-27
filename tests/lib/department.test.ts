import { describe, expect, it } from 'vitest';
import {
	ADMIN_HOME,
	canAccessEsl,
	computeRootRedirect,
	ESL_HOME,
	INTERNATIONAL_HOME,
	parseStoredDepartment,
	readLastDepartment,
	resolveDepartmentFromPath,
	showDepartmentSwitcher,
	storeLastDepartment
} from '$lib/department';
import { buildViewerSession } from '../mocks/route-mocks';

function storageWith(value: string | null) {
	let held = value;
	return {
		getItem: () => held,
		setItem: (_key: string, next: string) => {
			held = next;
		}
	};
}

describe('resolveDepartmentFromPath', () => {
	it('resolves ESL and evaluations URLs', () => {
		expect(resolveDepartmentFromPath('/esl')).toBe('esl');
		expect(resolveDepartmentFromPath('/esl/')).toBe('esl');
		expect(resolveDepartmentFromPath('/esl/schedule')).toBe('esl');
		expect(resolveDepartmentFromPath('/esl/zipgrade')).toBe('esl');
		expect(resolveDepartmentFromPath('/evaluations')).toBe('international');
		expect(resolveDepartmentFromPath('/evaluations/new')).toBe('international');
		expect(resolveDepartmentFromPath('/evaluations/student/888001')).toBe('international');
	});

	it('returns null for non-department paths so they never overwrite storage', () => {
		expect(resolveDepartmentFromPath('/')).toBeNull();
		expect(resolveDepartmentFromPath('/login')).toBeNull();
		expect(resolveDepartmentFromPath('/admin')).toBeNull();
		expect(resolveDepartmentFromPath('/admin/users')).toBeNull();
		expect(resolveDepartmentFromPath('/esl-admin')).toBeNull();
		expect(resolveDepartmentFromPath('/leaderboard')).toBeNull();
		expect(resolveDepartmentFromPath('/display')).toBeNull();
	});
});

describe('department storage', () => {
	it('parses only the two known values', () => {
		expect(parseStoredDepartment('esl')).toBe('esl');
		expect(parseStoredDepartment('international')).toBe('international');
		expect(parseStoredDepartment(null)).toBeNull();
		expect(parseStoredDepartment('')).toBeNull();
		expect(parseStoredDepartment('admin')).toBeNull();
	});

	it('round-trips the last-visited department', () => {
		const storage = storageWith(null);
		expect(readLastDepartment(storage)).toBeNull();
		storeLastDepartment('esl', storage);
		expect(readLastDepartment(storage)).toBe('esl');
	});

	it('treats a corrupt value as absent', () => {
		expect(readLastDepartment(storageWith('admin'))).toBeNull();
	});

	it('never throws when storage is unavailable', () => {
		const failing = {
			getItem: () => null as string | null,
			setItem: () => {
				throw new Error('private mode');
			}
		};
		expect(() => storeLastDepartment('esl', failing)).not.toThrow();
		expect(readLastDepartment(null)).toBeNull();
	});
});

describe('showDepartmentSwitcher', () => {
	it('is strictly a hybrid/super affordance', () => {
		const hybrid = buildViewerSession({
			role: 'teacher',
			status: 'active',
			departmentRoles: { international: 'teacher', esl: 'teacher' }
		});
		const superUser = buildViewerSession({ role: 'super', status: 'active' });
		expect(showDepartmentSwitcher(hybrid)).toBe(true);
		expect(showDepartmentSwitcher(superUser)).toBe(true);
	});

	it('stays hidden for single-department staff', () => {
		const internationalOnly = buildViewerSession({ role: 'teacher', status: 'active' });
		const eslOnly = buildViewerSession({
			role: 'teacher',
			status: 'active',
			departmentRoles: { esl: 'admin' }
		});
		expect(showDepartmentSwitcher(internationalOnly)).toBe(false);
		expect(showDepartmentSwitcher(eslOnly)).toBe(false);
	});

	it('stays hidden while loading or pending', () => {
		const hybrid = buildViewerSession({
			role: 'teacher',
			status: 'active',
			departmentRoles: { international: 'teacher', esl: 'teacher' }
		});
		expect(showDepartmentSwitcher({ ...hybrid, status: 'loading' })).toBe(false);
		const pending = buildViewerSession({ role: 'teacher', status: 'pending' });
		expect(showDepartmentSwitcher(pending)).toBe(false);
		const signedOut = buildViewerSession({ auth: { isAuthenticated: false } });
		expect(showDepartmentSwitcher(signedOut)).toBe(false);
	});
});

describe('canAccessEsl', () => {
	it('allows active ESL staff and super users', () => {
		const eslOnly = buildViewerSession({
			role: 'teacher',
			status: 'active',
			departmentRoles: { esl: 'teacher' }
		});
		expect(canAccessEsl(eslOnly)).toBe(true);
		const superUser = buildViewerSession({ role: 'super', status: 'active' });
		expect(canAccessEsl(superUser)).toBe(true);
	});

	it('blocks International-only staff and unsettled sessions', () => {
		const international = buildViewerSession({ role: 'teacher', status: 'active' });
		expect(canAccessEsl(international)).toBe(false);
		const signedOut = buildViewerSession({ auth: { isAuthenticated: false } });
		expect(canAccessEsl(signedOut)).toBe(false);
	});
});

describe('computeRootRedirect', () => {
	it('redirects ESL-only staff to the ESL home', () => {
		const eslOnly = buildViewerSession({
			role: 'teacher',
			status: 'active',
			departmentRoles: { esl: 'admin' }
		});
		expect(computeRootRedirect(eslOnly, null)).toBe(ESL_HOME);
		expect(computeRootRedirect(eslOnly, 'international')).toBe(ESL_HOME);
	});

	it('returns hybrid staff to their last-visited department', () => {
		const hybrid = buildViewerSession({
			role: 'teacher',
			status: 'active',
			departmentRoles: { international: 'teacher', esl: 'teacher' }
		});
		expect(computeRootRedirect(hybrid, 'esl')).toBe(ESL_HOME);
		expect(computeRootRedirect(hybrid, 'international')).toBe(INTERNATIONAL_HOME);
		expect(computeRootRedirect(hybrid, null)).toBe(INTERNATIONAL_HOME);
	});

	it('keeps an admin hybrid defaulting to the admin landing', () => {
		const hybridAdmin = buildViewerSession({
			role: 'admin',
			status: 'active',
			departmentRoles: { international: 'admin', esl: 'admin' }
		});
		expect(computeRootRedirect(hybridAdmin, 'esl')).toBe(ESL_HOME);
		expect(computeRootRedirect(hybridAdmin, null)).toBe(ADMIN_HOME);
	});

	it('preserves existing student and International staff behavior', () => {
		const student = buildViewerSession({
			role: 'student',
			status: 'active',
			enrollmentStatus: 'Enrolled',
			studentId: '888001'
		});
		expect(computeRootRedirect(student, 'esl')).toBe('/evaluations/student/888001');
		expect(
			computeRootRedirect(buildViewerSession({ role: 'teacher', status: 'active' }), 'esl')
		).toBe(INTERNATIONAL_HOME);
		expect(
			computeRootRedirect(buildViewerSession({ role: 'admin', status: 'active' }), 'esl')
		).toBe(ADMIN_HOME);
	});

	it('returns null for non-redirecting states', () => {
		const loading = buildViewerSession({ auth: { isLoading: true } });
		expect(computeRootRedirect(loading, 'esl')).toBeNull();
		const pending = buildViewerSession({ role: 'teacher', status: 'pending' });
		expect(computeRootRedirect(pending, 'esl')).toBeNull();
		const signedOut = buildViewerSession({ auth: { isAuthenticated: false } });
		expect(computeRootRedirect(signedOut, 'esl')).toBeNull();
	});

	it('routes super users by their last-visited department', () => {
		const superUser = buildViewerSession({ role: 'super', status: 'active' });
		expect(computeRootRedirect(superUser, 'esl')).toBe(ESL_HOME);
		expect(computeRootRedirect(superUser, null)).toBe(ADMIN_HOME);
	});
});
