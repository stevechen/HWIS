import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import {
	createMockEvaluation,
	mockCategories,
	mockStudent
} from '../../../../fixtures/evaluations';
import { buildViewerSession } from '../../../../mocks/route-mocks';
import {
	headerTeacherScope,
	headerTeacherScopeVisible,
	headerTitleOverride
} from '$lib/stores/header';

// The real generated `api` is an `anyApi` proxy that returns a fresh, key-less
// object per access, so it can't be used to discriminate queries in a mock.
// Replace it with stable references carrying a `__queryName` we can switch on.
vi.mock('$convex/_generated/api', () => {
	const fn = (name: string) => ({ __queryName: name });
	return {
		api: {
			evaluations: {
				getStudent: fn('getStudent'),
				getStudentByStudentIdCode: fn('getStudentByStudentIdCode'),
				getStudentEvaluationsByTeacher: fn('byTeacher'),
				getStudentEvaluationsByTeacherByStudentIdCode: fn('byTeacherCode'),
				getStudentEvaluationsAllByTeacher: fn('allByTeacher'),
				getStudentEvaluationsAllByTeacherByStudentIdCode: fn('allByTeacherCode'),
				getStudentEvaluationsAnonymous: fn('anon')
			},
			categories: { list: fn('categories') }
		},
		internal: {}
	};
});

const viewerTeacherId = 'user_1';

// Own evaluation (viewer is teacher-001 / user_1) + two other teachers' entries.
const allTeachersData = [
	createMockEvaluation({
		_id: 'own-1',
		teacherId: viewerTeacherId,
		teacherName: 'Ms. Johnson',
		category: 'Academic',
		details: 'Own work'
	}),
	createMockEvaluation({
		_id: 'other-1',
		teacherId: 'teacher-002',
		teacherName: 'Mr. Smith',
		category: 'Behavior',
		details: 'Other work'
	}),
	createMockEvaluation({
		_id: 'admin-1',
		teacherId: 'admin-001',
		teacherName: 'Admin User',
		category: 'Special',
		details: 'Admin work'
	})
];

// The "Mine only" scope returns just the viewer's own evaluation.
const mineData = [allTeachersData[0]];

const queryMap = new Map<string, unknown>([
	['getStudent', mockStudent],
	['getStudentByStudentIdCode', mockStudent],
	['byTeacher', mineData],
	['byTeacherCode', mineData],
	['allByTeacher', allTeachersData],
	['allByTeacherCode', allTeachersData],
	['anon', []],
	['categories', mockCategories]
]);

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn((queryRef: { __queryName?: string }) => ({
		data: queryMap.get(queryRef?.__queryName ?? '') ?? [],
		isLoading: false,
		isStale: false,
		error: undefined
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

import { api } from '$convex/_generated/api';
import StudentEvaluationsPage from '$src/routes/evaluations/student/[studentId]/+page.svelte';
import { useViewer } from '$lib/viewer.svelte';

// Keep the mocked `api` references reachable for the query map (already built
// via the same fake). Touch `api` so the import isn't tree-shaken.
void api;

function teacherSession() {
	return buildViewerSession({ role: 'teacher', status: 'active' });
}

describe('Student Evaluations Page — teacher cross-teacher scope', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		headerTeacherScope.set('all');
		headerTeacherScopeVisible.set(false);
		headerTitleOverride.set('');
		vi.mocked(useViewer).mockReturnValue(teacherSession());
	});

	it('defaults to the "all teachers" scope and exposes the scope tab in the header', async () => {
		render(StudentEvaluationsPage, { props: { data: {} } });

		// Page wired the global header to show the scope tab for a teacher.
		expect(get(headerTeacherScopeVisible)).toBe(true);
		expect(get(headerTeacherScope)).toBe('all');
		// Title is the bare student name, without an "Evaluations" suffix.
		expect(get(headerTitleOverride)).toBe('John Smith');
	});

	it('shows all teachers’ data but masks other teachers’ names (keeps own)', async () => {
		render(StudentEvaluationsPage, { props: { data: {} } });

		// Other teachers' evaluations are present (categories visible)...
		await expect.element(page.getByText('Behavior', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('Special', { exact: true })).toBeInTheDocument();
		// ...but their names are hidden.
		await expect.element(page.getByText('Mr. Smith')).not.toBeInTheDocument();
		await expect.element(page.getByText('Admin User')).not.toBeInTheDocument();
		// The viewer's own name is shown.
		await expect.element(page.getByText('Ms. Johnson')).toBeInTheDocument();
	});

	it('switches to "mine only" when the scope store is set to mine', async () => {
		render(StudentEvaluationsPage, { props: { data: {} } });

		// Let the page's mount effect settle (it resets scope to "all"), then switch.
		await tick();
		headerTeacherScope.set('mine');

		// Other teachers' evaluations are no longer included.
		await expect.element(page.getByText('Behavior', { exact: true })).not.toBeInTheDocument();
		await expect.element(page.getByText('Special', { exact: true })).not.toBeInTheDocument();
		// The viewer's own evaluation remains.
		await expect.element(page.getByText('Ms. Johnson')).toBeInTheDocument();
	});
});
