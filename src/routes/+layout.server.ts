export const load = async ({
	cookies,
	url
}: {
	cookies: { get: (name: string) => string | undefined };
	url: URL;
}) => {
	const testAuthCookie = cookies.get('hwis_test_auth') || '';
	const isTestMode = testAuthCookie.length > 0;

	let testRole: 'teacher' | 'admin' | 'super' | undefined = undefined;
	if (isTestMode) {
		// Support formats: "true", "true;role=admin", "admin", "super"
		const roleValue = testAuthCookie.split(';')[0].trim();
		if (['admin', 'super'].includes(roleValue)) {
			testRole = roleValue as 'admin' | 'super';
		} else {
			// Check for role= in the full cookie value
			const roleMatch = testAuthCookie.match(/role=(\w+)/);
			if (roleMatch && ['admin', 'super', 'teacher'].includes(roleMatch[1])) {
				testRole = roleMatch[1] as 'teacher' | 'admin' | 'super';
			}
		}
	}

	return {
		isLoginPage: url.pathname === '/login',
		isTestMode,
		testRole
	};
};
