export const ssr = false;

export const load = async ({ url }: { url: URL }) => {
	const demoQuery = url.searchParams.get('demo');

	return {
		demo: demoQuery || undefined,
		studentId: url.pathname.split('/').pop()
	};
};
