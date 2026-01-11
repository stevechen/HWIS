export const load = async ({ cookies, url }: { cookies: any; url: URL }) => {
	return {
		isLoginPage: url.pathname === '/login',
		isTestMode: cookies.get('hwis_test_auth') === 'true'
	};
};
