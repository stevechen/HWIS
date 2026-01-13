export const load = async ({
	cookies,
	url
}: {
	cookies: { get: (name: string) => string | undefined };
	url: URL;
}) => {
	return {
		isLoginPage: url.pathname === '/login',
		isTestMode: cookies.get('hwis_test_auth') === 'true'
	};
};
