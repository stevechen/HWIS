import { page, userEvent } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getFunctionName } from 'convex/server';
import { useQuery } from 'convex-svelte';
import { buildViewerSession } from '../../../mocks/route-mocks';

vi.mock('$app/state', () => ({
	page: {
		params: { userId: 'user_teacher' },
		url: new URL('http://localhost/esl/admin/users/user_teacher')
	}
}));

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: undefined, isLoading: true, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true }))
}));

import ProfilePage from '$src/routes/esl/admin/users/[userId]/+page.svelte';

const CLASSES = [
	{
		_id: 'class_clil',
		name: 'G7 Basic 1 CLIL',
		type: 'CLIL',
		room: 'ESL A',
		cohortId: 'cohort_1',
		cohortLabel: '2025-2026 G7 Basic 1',
		cohortGrade: 7,
		cohortClassNumber: '1',
		meetings: [
			{ day: 'Monday', period: 1 },
			{ day: 'Wednesday', period: 1 },
			{ day: 'Friday', period: 1 }
		]
	},
	{
		_id: 'class_comm',
		name: 'G7 Basic 2 Comm',
		type: 'Comm',
		room: null,
		cohortId: 'cohort_2',
		cohortLabel: '2025-2026 G7 Basic 2',
		cohortGrade: 7,
		cohortClassNumber: '2',
		meetings: [
			{ day: 'Tuesday', period: 2 },
			{ day: 'Thursday', period: 2 }
		]
	}
];

const PROFILE = {
	_id: 'user_teacher',
	name: 'Theo Teacher',
	role: 'teacher',
	status: 'active',
	eslRole: 'teacher',
	internationalRole: 'teacher',
	email: 'theo@hwhs.tc.edu.tw',
	image: null,
	years: ['2025-2026', '2024-2025'],
	classes: CLASSES
};

function withProfile(profile: unknown) {
	vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
		const name = getFunctionName(reference as never);
		return {
			data: name === 'esl/staff:getProfile' ? profile : undefined,
			isLoading: profile === undefined,
			error: null
		};
	}) as never);
}

function withProfileError(message: string) {
	vi.mocked(useQuery).mockReturnValue({
		data: undefined,
		isLoading: false,
		error: new Error(message)
	} as never);
}

async function signInAsEslAdmin() {
	const { useViewer } = await import('$lib/viewer.svelte');
	vi.mocked(useViewer).mockReturnValue(
		buildViewerSession({ role: 'teacher', status: 'active', departmentRoles: { esl: 'admin' } })
	);
}

async function signInAsNonAdmin() {
	const { useViewer } = await import('$lib/viewer.svelte');
	vi.mocked(useViewer).mockReturnValue(buildViewerSession({ role: 'teacher', status: 'active' }));
}

/** Route the availability list query to saved blocks while the profile stays fixed. */
function withProfileAndBlocks(blocks: unknown[]) {
	vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
		const name = getFunctionName(reference as never);
		return {
			data:
				name === 'esl/staff:getProfile'
					? PROFILE
					: name === 'esl/availability:listByYear'
						? blocks
						: undefined,
			isLoading: false,
			error: null
		};
	}) as never);
}

async function openAvailabilityDialog() {
	await userEvent.click(page.getByTestId('esl-admin-user-profile.availability.trigger'));
	await expect
		.element(page.getByTestId('esl-admin-user-profile.availability.dialog'))
		.toBeInTheDocument();
}

describe('ESL teacher profile page', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await signInAsEslAdmin();
		withProfile(PROFILE);
	});

	it('renders the teacher name as heading with a back link', async () => {
		render(ProfilePage);

		await expect.element(page.getByRole('heading', { name: 'Theo Teacher' })).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-admin-user-profile.back')).toBeInTheDocument();
	});

	it('shows the email address as a mail link', async () => {
		render(ProfilePage);

		const email = page.getByTestId('esl-admin-user-profile.email');
		await expect.element(email).toHaveTextContent('theo@hwhs.tc.edu.tw');
		await expect.element(email).toHaveAttribute('href', 'mailto:theo@hwhs.tc.edu.tw');
	});

	it('shows no-email state when the address is missing', async () => {
		withProfile({ ...PROFILE, email: undefined });
		render(ProfilePage);

		await expect
			.element(page.getByTestId('esl-admin-user-profile.email'))
			.toHaveTextContent('No email on file');
	});

	it('offers the school years in a picker', async () => {
		render(ProfilePage);

		const year = page.getByTestId('esl-admin-user-profile.year');
		await expect.element(year).toBeInTheDocument();
		await expect.element(year.getByRole('option', { name: '2025-2026' })).toBeInTheDocument();
		await expect.element(year.getByRole('option', { name: '2024-2025' })).toBeInTheDocument();
	});

	it('totals the teaching load with a per-class breakdown', async () => {
		render(ProfilePage);

		await expect
			.element(page.getByTestId('esl-admin-user-profile.periods'))
			.toHaveTextContent('5 periods/week');
		await expect.element(page.getByText('3 periods/week')).toBeInTheDocument();
		await expect.element(page.getByText('2 periods/week')).toBeInTheDocument();
	});

	it('lists classes with rooms, flagging unset rooms', async () => {
		render(ProfilePage);

		await expect.element(page.getByText('G7 Basic 1 CLIL')).toBeInTheDocument();
		await expect.element(page.getByText('G7 Basic 2 Comm')).toBeInTheDocument();
		await expect.element(page.getByText('ESL A', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('Room not set')).toBeInTheDocument();
	});

	it('renders the live-status section', async () => {
		render(ProfilePage);

		await expect.element(page.getByTestId('esl-admin-user-profile.now')).toBeInTheDocument();
	});

	it('shows the empty state when nothing is assigned', async () => {
		withProfile({ ...PROFILE, classes: [] });
		render(ProfilePage);

		await expect
			.element(page.getByTestId('esl-admin-user-profile.empty'))
			.toHaveTextContent('No classes assigned in 2025-2026.');
		await expect
			.element(page.getByTestId('esl-admin-user-profile.periods'))
			.toHaveTextContent('0 periods/week');
	});

	it('shows a loading state while the profile resolves', async () => {
		withProfile(undefined);
		render(ProfilePage);

		await expect
			.element(page.getByTestId('esl-admin-user-profile.loading'))
			.toHaveTextContent('Loading profile…');
	});

	it('shows the not-found state for a bad user id', async () => {
		withProfileError('User not found');
		render(ProfilePage);

		await expect
			.element(page.getByTestId('esl-admin-user-profile.not-found'))
			.toHaveTextContent('Staff member not found.');
	});
});

describe('ESL teacher profile availability buttons', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await signInAsEslAdmin();
		withProfile(PROFILE);
	});

	it('shows both header buttons to ESL admins', async () => {
		render(ProfilePage);

		await expect
			.element(page.getByTestId('esl-admin-user-profile.availability.trigger'))
			.toHaveTextContent('Set availability');
		await expect
			.element(page.getByTestId('esl-admin-user-profile.schedule.trigger'))
			.toHaveTextContent('View weekly schedule');
	});

	it('hides both buttons from non-admin viewers', async () => {
		await signInAsNonAdmin();
		render(ProfilePage);

		await expect.element(page.getByTestId('esl-admin-user-profile.title')).toBeInTheDocument();
		expect(page.getByTestId('esl-admin-user-profile.availability.trigger').elements()).toHaveLength(
			0
		);
		expect(page.getByTestId('esl-admin-user-profile.schedule.trigger').elements()).toHaveLength(0);
	});

	it('opens the availability dialog on an empty grid with the hint and a disabled Save', async () => {
		render(ProfilePage);
		await openAvailabilityDialog();

		expect(page.getByTestId('esl-admin-user-profile.availability.cell').elements()).toHaveLength(
			40
		);
		await expect
			.element(page.getByTestId('esl-admin-user-profile.availability.hint'))
			.toHaveTextContent('All periods available — click a slot to mark NA.');
		const saveButton = page.getByTestId('esl-admin-user-profile.availability.save');
		await expect.element(saveButton).toBeDisabled();
	});

	it('toggles a slot to NA and back, gating Save on dirtiness', async () => {
		render(ProfilePage);
		await openAvailabilityDialog();

		const saveButton = page.getByTestId('esl-admin-user-profile.availability.save');
		const mondayFirst = page
			.getByTestId('esl-admin-user-profile.availability.cell')
			.elements()
			.find((cell) => cell.getAttribute('aria-label') === 'Mo P1 available');
		if (!mondayFirst) throw new Error('no Mo P1 cell');
		await userEvent.click(mondayFirst);

		await expect.element(mondayFirst).toHaveTextContent('NA');
		await expect
			.element(page.getByTestId('esl-admin-user-profile.availability.note'))
			.toBeInTheDocument();
		await expect.element(saveButton).not.toBeDisabled();

		await userEvent.click(mondayFirst);
		await expect
			.element(page.getByTestId('esl-admin-user-profile.availability.hint'))
			.toBeInTheDocument();
		await expect.element(saveButton).toBeDisabled();
	});

	it('saves a toggled slot with its note and confirms on the page', async () => {
		render(ProfilePage);
		await openAvailabilityDialog();

		const mondayFirst = page
			.getByTestId('esl-admin-user-profile.availability.cell')
			.elements()
			.find((cell) => cell.getAttribute('aria-label') === 'Mo P1 available');
		if (!mondayFirst) throw new Error('no Mo P1 cell');
		await userEvent.click(mondayFirst);
		await userEvent.fill(
			page.getByTestId('esl-admin-user-profile.availability.note'),
			'HWIS homeroom'
		);
		await userEvent.click(page.getByTestId('esl-admin-user-profile.availability.save'));

		await expect
			.element(page.getByTestId('esl-admin-user-profile.notice'))
			.toHaveTextContent('Availability saved for 2025-2026: 1 blocked period');
		expect(page.getByTestId('esl-admin-user-profile.availability.dialog').elements()).toHaveLength(
			0
		);
	});

	it('asks to confirm discarding when closed with unsaved toggles', async () => {
		render(ProfilePage);
		await openAvailabilityDialog();

		const cells = page.getByTestId('esl-admin-user-profile.availability.cell').elements();
		await userEvent.click(cells[0]);
		await userEvent.click(page.getByTestId('esl-admin-user-profile.availability.cancel'));

		await expect
			.element(page.getByTestId('esl-admin-user-profile.availability.discard'))
			.toBeInTheDocument();
		// Still open: the draft is held for the verdict, not thrown away.
		await expect
			.element(page.getByTestId('esl-admin-user-profile.availability.dialog'))
			.toBeInTheDocument();

		await userEvent.click(page.getByTestId('esl-admin-user-profile.availability.discard-yes'));
		expect(page.getByTestId('esl-admin-user-profile.availability.dialog').elements()).toHaveLength(
			0
		);
	});

	it('loads saved blocks marked NA with the note filled in and Save clean', async () => {
		withProfileAndBlocks([
			{
				teacherId: 'user_teacher',
				year: '2025-2026',
				day: 'Monday',
				period: 1,
				note: 'HWIS homeroom'
			}
		]);
		render(ProfilePage);
		await openAvailabilityDialog();

		const blocked = page
			.getByTestId('esl-admin-user-profile.availability.cell')
			.elements()
			.filter((cell) => cell.getAttribute('data-blocked') === 'true');
		expect(blocked).toHaveLength(1);
		await expect.element(blocked[0]).toHaveTextContent('NA');
		await expect
			.element(page.getByTestId('esl-admin-user-profile.availability.note'))
			.toHaveValue('HWIS homeroom');
		const saveButton = page.getByTestId('esl-admin-user-profile.availability.save');
		await expect.element(saveButton).toBeDisabled();
	});

	it('opens the weekly schedule placeholder', async () => {
		render(ProfilePage);

		await userEvent.click(page.getByTestId('esl-admin-user-profile.schedule.trigger'));

		await expect
			.element(page.getByTestId('esl-admin-user-profile.schedule.dialog'))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId('esl-admin-user-profile.schedule.placeholder'))
			.toHaveTextContent('ticket #167');
	});
});
