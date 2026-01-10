export const load = async ({ url }) => {
	return {
		isLoginPage: url.pathname === '/login'
	};
};
