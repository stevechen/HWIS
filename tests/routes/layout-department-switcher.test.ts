import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { buildViewerSession, type ViewerSessionConfig } from '../mocks/route-mocks';

const mockPageUrl = { pathname: '/', search: '' };
const gotoMock = vi.fn();
const setItemMock = vi.fn();
const getItemMock = vi.fn((): string | null => null);

vi.mock('convex-svelte', () => ({
	setupConvex: vi.fn(),
	useQuery: vi.fn(),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/auth-client', () => ({
	authClient: {
		useSession: vi.fn(() => ({
			subscribe(run: (value: { isPending: boolean; data: unknown }) => void) {
				run({ isPending: false, data: null });
				return () => {};
			}
		})),
		signOut: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	createSvelteAuthClient: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

vi.mock('$app/stores', async () => {
	const actual = await vi.importActual('$app/stores');
	return {
		...actual,
		page: {
			subscribe: vi.fn((callback: (value: { url: { pathname: string } }) => void) => {
				callback({ url: mockPageUrl });
				return () => {};
			})
		}
	};
});

vi.stubGlobal('localStorage', {
	get getItem() {
		return getItemMock;
	},
	get setItem() {
		return setItemMock;
	}
});

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('$lib/stores/theme', () => {
	function subscribe(run: (value: 'light' | 'dark') => void) {
		run('light');
		return () => {};
	}
	return {
		theme: {
			subscribe,
			init: vi.fn(),
			toggle: vi.fn(),
			setTheme: vi.fn()
		}
	};
});

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

import Layout from '$src/routes/+layout.svelte';

function viewerFor(config: ViewerSessionConfig) {
	return buildViewerSession(config);
}

function hybridSession() {
	return viewerFor({
		role: 'teacher',
		status: 'active',
		departmentRoles: { international: 'teacher', esl: 'teacher' }
	});
}

function renderLayout() {
	return render(Layout, {
		props: { children: createRawSnippet(() => ({ render: () => '<span>CHILD</span>' })) }
	});
}

const switcher = () => page.getByRole('group', { name: 'Department switcher' });

describe('root layout department switcher', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getItemMock.mockReturnValue(null);
		mockPageUrl.pathname = '/evaluations';
		mockPageUrl.search = '';
	});

	it('renders the HWIS/ESL pill for hybrid staff', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(hybridSession());
		renderLayout();
		await expect.element(switcher()).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'HWIS' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'ESL' })).toBeInTheDocument();
	});
});
