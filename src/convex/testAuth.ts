import { isTestRuntime, isProdDeployment } from './auth';
import type { MutationCtx, QueryCtx } from './_generated/server';

let _testAuthRole: 'admin' | 'super' = 'admin';

export function setTestAuthRole(role: 'admin' | 'super') {
	_testAuthRole = role;
}

export function getTestAuthRole(): 'admin' | 'super' {
	return _testAuthRole;
}

export function injectTestToken(
	ctx: MutationCtx | QueryCtx,
	role?: 'admin' | 'super'
): string | undefined {
	if (role) {
		setTestAuthRole(role);
	}
	return getTestTokenForRole(_testAuthRole);
}

export function getTestTokenForRole(role: 'admin' | 'super'): string | undefined {
	if (isTestRuntime) {
		return role === 'super' ? 'super-unit-test-token' : 'unit-test-token';
	}
	if (!isProdDeployment) {
		return 'unit-test-token';
	}
	return undefined;
}

export function resolveEffectiveTestToken(testToken?: string): string | undefined {
	if (testToken) return testToken;

	if (!testToken && (isTestRuntime || !isProdDeployment)) {
		return _testAuthRole === 'super' ? 'super-unit-test-token' : 'unit-test-token';
	}
	return undefined;
}

export function getTestAuthUser(role: 'admin' | 'super') {
	const isSuper = role === 'super';
	return {
		_id: isSuper ? 'test-super-user-id' : 'test-user-id',
		authId: isSuper ? 'test_super' : 'test_admin',
		name: isSuper ? 'Test Super' : 'Test Admin',
		role,
		status: 'active'
	};
}
