export const ssr = false;

export const load = async ({ url }: { url: URL }) => {
	return {
		studentId: url.pathname.split('/').pop()
	};
};
