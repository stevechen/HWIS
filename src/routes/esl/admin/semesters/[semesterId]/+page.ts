export const ssr = false;

export const load = async ({ url }: { url: URL }) => {
	return {
		semesterId: url.pathname.split('/').pop()
	};
};
