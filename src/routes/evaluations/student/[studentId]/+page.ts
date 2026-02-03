export const ssr = false;

export const load = async ({ url }: { url: URL }) => {
	const testRoleQuery = url.searchParams.get('testRole');
	const demoQuery = url.searchParams.get('demo');

	let testRole: 'teacher' | 'admin' | 'super' | undefined = undefined;
	if (testRoleQuery && ['admin', 'super', 'teacher'].includes(testRoleQuery)) {
		testRole = testRoleQuery as 'teacher' | 'admin' | 'super';
	}

	return {
		testRole,
		demo: demoQuery || undefined,
		studentId: url.pathname.split('/').pop()
	};
};
