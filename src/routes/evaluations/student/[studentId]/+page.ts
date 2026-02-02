export const ssr = false;

export const load = async ({ url }: { url: URL }) => {
	const testRoleQuery = url.searchParams.get('testRole');

	let testRole: 'teacher' | 'admin' | 'super' | undefined = undefined;
	if (testRoleQuery && ['admin', 'super', 'teacher'].includes(testRoleQuery)) {
		testRole = testRoleQuery as 'teacher' | 'admin' | 'super';
	}

	return {
		testRole,
		studentId: url.pathname.split('/').pop()
	};
};
