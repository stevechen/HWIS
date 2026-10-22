import { page, userEvent } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import { getFunctionName } from 'convex/server';
import { selectOption } from '../../../lib/select';
import { roomButton } from '../../../lib/esl-schedule';
import { useQuery } from 'convex-svelte';

const mockMutation = vi.fn().mockResolvedValue(undefined);
/** The mirror preview's resolution; overwritten per test that needs mirrors. */
const mockClientQuery = vi.fn().mockResolvedValue({ targets: [] });

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		// An empty mirror list: every save commits directly, exactly as before
		// the preview step existed. Tests that exercise the confirm overwrite
		// this resolution per case.
		query: mockClientQuery
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true }))
}));

import { api } from '$convex/_generated/api';
import ClassesPage from '$src/routes/esl/admin/classes/+page.svelte';

const G7_COHORT = {
	_id: 'cohort_g7',
	year: '2025-2026',
	grade: 7,
	level: 'Basic',
	classNumber: '1',
	code: 'G7-Basic-1',
	status: 'active' as const,
	createdAt: 0,
	label: '2025-2026 G7 Basic 1',
	classes: [
		{
			_id: 'class_clil',
			cohortId: 'cohort_g7',
			type: 'CLIL' as const,
			name: 'G7 Basic 1 CLIL',
			status: 'active' as const,
			createdAt: 0
		},
		{
			_id: 'class_comm',
			cohortId: 'cohort_g7',
			type: 'Comm' as const,
			name: 'G7 Basic 1 Comm',
			status: 'active' as const,
			createdAt: 0
		}
	]
};

const G9_COHORT = {
	_id: 'cohort_g9',
	year: '2026-2027',
	grade: 9,
	level: 'Intermediate',
	classNumber: '1',
	code: 'G9-Intermediate-1',
	status: 'archived' as const,
	createdAt: 0,
	label: '2026-2027 G9 Intermediate 1',
	classes: [
		{
			_id: 'class_g9',
			cohortId: 'cohort_g9',
			type: 'G9' as const,
			name: 'G9 Intermediate 1',
			teacherId: 'user_t1',
			status: 'active' as const,
			createdAt: 0
		}
	]
};

/** Grade 10 is levelled A/B: one Chinese class at one level is one cohort, one class. */
const G10_COHORT_A = {
	_id: 'cohort_g10a',
	year: '2025-2026',
	grade: 10,
	level: 'A',
	classNumber: '01',
	code: 'G10-01A',
	status: 'active' as const,
	createdAt: 0,
	label: '2025-2026 G10 H101A',
	classes: [
		{
			_id: 'class_h10a',
			cohortId: 'cohort_g10a',
			type: 'H10A' as const,
			name: 'H101A',
			status: 'active' as const,
			createdAt: 0
		}
	]
};

const G10_COHORT_B = {
	...G10_COHORT_A,
	_id: 'cohort_g10b',
	level: 'B',
	code: 'G10-01B',
	label: '2025-2026 G10 H101B',
	classes: [
		{
			_id: 'class_h10b',
			cohortId: 'cohort_g10b',
			type: 'H10B' as const,
			name: 'H101B',
			status: 'active' as const,
			createdAt: 0
		}
	]
};

const ASSIGNABLE = [
	{ _id: 'user_t1', name: 'Alice Teacher' },
	{ _id: 'user_t2', name: 'Bob Teacher' }
];

/**
 * The readiness response every test gets unless it overrides one.
 *
 * The Classes page now hides the grid until readiness resolves, so the default
 * has to look like a confirmed year; gate tests override it with `readiness()`.
 */
function confirmedReadiness() {
	return {
		year: '2026-2027',
		confirmed: true,
		confirmedReason: 'signoff' as const,
		confirmedAt: 1,
		confirmedBy: 'Ada Admin',
		canConfirm: true,
		blockers: [],
		warnings: [],
		grades: [],
		activeStudents: 0
	};
}

/** Routes each `useQuery` call to canned data by its Convex function name. */
function mockQueries(data: Record<string, unknown>) {
	vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
		const name = getFunctionName(reference as never);
		const value =
			data[name] ?? (name === 'esl/yearStatus:readiness' ? confirmedReadiness() : undefined);
		return { data: value === undefined ? [] : value, isLoading: false, error: null };
	}) as never);
}

function withCohorts() {
	mockQueries({
		'esl/cohorts:list': [G7_COHORT, G9_COHORT, G10_COHORT_A, G10_COHORT_B],
		'esl/staff:listAssignable': ASSIGNABLE
	});
}

/** Only the levelled cohorts, for tests that count or filter on them. */
function withLevelledCohortsOnly() {
	mockQueries({
		'esl/cohorts:list': [G7_COHORT, G9_COHORT],
		'esl/staff:listAssignable': ASSIGNABLE
	});
}

/** One row of the year's schedule, as `esl/classes:listScheduleByYear` returns it. */
type ScheduleRow = {
	classId: string;
	name: string;
	type: 'CLIL' | 'Comm' | 'G9' | 'H10A' | 'H10B';
	cohortId: string;
	teacherId: string | null;
	room: string | null;
	meetings: readonly { day: string; period: number }[];
	scheduleProblem: unknown;
	scheduleLabel: string | null;
	problems?: { kind: string; message: string; day?: string; period?: number; otherName?: string }[];
};

/**
 * The cohorts plus a year's schedule rows.
 *
 * The schedule query is keyed off the same mocked `useQuery`, so a test that
 * cares about chips and badges has to supply rows — the page reads the year's
 * meetings from a separate query, not from the cohort list.
 *
 * `withSchedule` narrows the cohort list to the one year it supplies rows for. The
 * page's schedule year is the *most recent* year present, so leaving the 2026-2027
 * cohorts in would point the editor at a year with no rows and the 2025-2026 rows
 * would never render — the class under test would show "Set the year filter…".
 */
function withSchedule(rows: ScheduleRow[], year = '2025-2026') {
	const cohorts = [G7_COHORT, G9_COHORT, G10_COHORT_A, G10_COHORT_B].filter(
		(cohort) => cohort.year === year
	);
	mockQueries({
		'esl/cohorts:list': cohorts,
		'esl/staff:listAssignable': ASSIGNABLE,
		'esl/classes:listScheduleByYear': rows
	});
}

/** A sound CLIL week: three distinct days, in a room, with nothing clashing. */
const SOUND_CLIL = {
	classId: 'class_clil',
	name: 'G7 Basic 1 CLIL',
	type: 'CLIL',
	cohortId: 'cohort_g7',
	teacherId: null,
	room: 'ESL A',
	meetings: [
		{ day: 'Monday', period: 1 },
		{ day: 'Wednesday', period: 2 },
		{ day: 'Friday', period: 3 }
	],
	scheduleProblem: null,
	scheduleLabel: null
} as const;

describe('ESL admin cohorts page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
		mockClientQuery.mockResolvedValue({ targets: [] });
	});

	describe('cohort list', () => {
		it('shows the paired CLIL and Comm classes of a grade 7 cohort', async () => {
			withCohorts();
			await render(ClassesPage);

			// The pair shares one grid cell so the two cards stay adjacent and
			// cannot be split by an unrelated card.
			await expect
				.element(page.getByTestId('esl-admin-classes.pair.G7-Basic-1'))
				.toBeInTheDocument();
			await expect
				.element(page.getByTestId('esl-admin-classes.card.class_clil'))
				.toMatchTextContent('G7 Basic 1 CLIL');
			await expect
				.element(page.getByTestId('esl-admin-classes.card.class_comm'))
				.toMatchTextContent('G7 Basic 1 Comm');
		});

		it('filters by year', async () => {
			withCohorts();
			await render(ClassesPage);

			// G9 is the only cohort in 2026-2027.
			await selectOption(page.getByTestId('esl-admin-classes.filter.year'), '2026-2027');

			await expect.element(page.getByTestId('esl-admin-classes.count')).toMatchTextContent('(1)');
		});

		it('filters by grade', async () => {
			withLevelledCohortsOnly();
			await render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.filter.grade'), '9');

			await expect.element(page.getByTestId('esl-admin-classes.count')).toMatchTextContent('(1)');
		});

		it('shows the empty state when the filters match nothing', async () => {
			withCohorts();
			await render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.filter.grade'), '8');

			await expect.element(page.getByTestId('esl-admin-classes.empty')).toBeInTheDocument();
		});

		it('shows each grade 10 level as its own cohort with one class', async () => {
			withCohorts();
			await render(ClassesPage);

			await expect
				.element(page.getByTestId('esl-admin-classes.card.class_h10a'))
				.toMatchTextContent('H101A');
			await expect
				.element(page.getByTestId('esl-admin-classes.card.class_h10b'))
				.toMatchTextContent('H101B');
		});

		it('labels a grade 10 cohort by its base class and level, not a level name', async () => {
			withCohorts();
			await render(ClassesPage);

			// The year is a page-level heading, not a per-card label: the class
			// names carry no year, so the card reads H101A and nothing else.
			const card = page.getByTestId('esl-admin-classes.card.class_h10a');
			await expect.element(card).toMatchTextContent('H101A');
			await expect.element(card).not.toMatchTextContent('2025-2026');
		});
	});

	describe('the class cards', () => {
		// The table is gone: one class, four lines, identical for every class in
		// every group. A card repeating the type beside a name already ending in
		// it, or a status badge reading `active` forever, said nothing.
		it('renders cards, not a table', async () => {
			withCohorts();
			await render(ClassesPage);

			expect(page.getByRole('table').elements()).toHaveLength(0);
			expect(page.getByRole('columnheader').elements()).toHaveLength(0);
			await expect
				.element(page.getByTestId('esl-admin-classes.card.class_clil'))
				.toBeInTheDocument();
		});

		it('shows the class name, teacher and schedule on each card', async () => {
			// With a schedule row, so the card renders its schedule line rather
			// than "Loading…".
			withSchedule([{ ...SOUND_CLIL }]);
			await render(ClassesPage);

			const card = page.getByTestId('esl-admin-classes.card.class_clil');
			await expect.element(card).toMatchTextContent('G7 Basic 1 CLIL');
			await expect
				.element(card.getByTestId('esl-admin-classes.teacher.class_clil'))
				.toBeInTheDocument();
			await expect
				.element(card.getByTestId('esl-admin-classes.schedule.toggle'))
				.toBeInTheDocument();
		});
	});

	describe('the removed create-class form', () => {
		it('offers no way to hand-build a cohort', async () => {
			withCohorts();
			await render(ClassesPage);

			await expect.element(page.getByTestId('esl-admin-classes.create')).not.toBeInTheDocument();
			await expect
				.element(page.getByTestId('esl-admin-classes.form.grade'))
				.not.toBeInTheDocument();
		});

		// The empty state used to say "Create the first one above", pointing at a
		// form that is gone.
		it('points an empty department at the roster import instead', async () => {
			mockQueries({ 'esl/cohorts:list': [], 'esl/staff:listAssignable': ASSIGNABLE });
			await render(ClassesPage);

			await expect
				.element(page.getByTestId('esl-admin-classes.empty'))
				.toMatchTextContent('Import a grade roster');
		});
	});

	describe('the import link', () => {
		it('sends the admin to the Students page with the year', async () => {
			withCohorts();
			await render(ClassesPage);

			const link = page.getByTestId('esl-admin-classes.import.link');
			await expect.element(link).toMatchTextContent('Import a roster');
			await expect
				.element(link)
				.toHaveAttribute('href', '/esl/admin/students?import=1&year=2026-2027');
		});

		it('does not host the workbook picker itself', async () => {
			withCohorts();
			await render(ClassesPage);

			await expect
				.element(page.getByTestId('esl-admin-students.import.toggle'))
				.not.toBeInTheDocument();
			await expect.element(page.getByTestId('esl-import.year')).not.toBeInTheDocument();
		});
	});

	describe('the roster gate', () => {
		/** The shape the page reads for an unconfirmed year. */
		function unconfirmed(overrides: Record<string, unknown> = {}) {
			return {
				...confirmedReadiness(),
				confirmed: false,
				confirmedReason: null,
				confirmedAt: null,
				confirmedBy: null,
				...overrides
			};
		}

		it('replaces the class grid while the year is unconfirmed', async () => {
			mockQueries({
				'esl/cohorts:list': [G9_COHORT],
				'esl/staff:listAssignable': ASSIGNABLE,
				'esl/yearStatus:readiness': unconfirmed({
					canConfirm: false,
					blockers: [
						{
							kind: 'missing-homeroom',
							message: '1 active G7 student has no Chinese homeroom.'
						}
					],
					warnings: [{ kind: 'no-cohorts', message: 'No active G8 cohorts.' }]
				})
			});
			await render(ClassesPage);

			await expect.element(page.getByTestId('esl-admin-classes.rosterGate')).toBeInTheDocument();
			await expect
				.element(page.getByTestId('esl-admin-classes.rosterGate.blockers'))
				.toMatchTextContent('no Chinese homeroom');
			await expect.element(page.getByTestId('esl-admin-classes.rosterGate.confirm')).toBeDisabled();
			await expect.element(page.getByTestId('esl-admin-classes.grade.9')).not.toBeInTheDocument();
		});

		it('confirms the year from the gate when the checklist passes', async () => {
			mockQueries({
				'esl/cohorts:list': [G9_COHORT],
				'esl/staff:listAssignable': ASSIGNABLE,
				'esl/yearStatus:readiness': unconfirmed({ canConfirm: true, blockers: [] })
			});
			await render(ClassesPage);

			await page.getByTestId('esl-admin-classes.rosterGate.confirm').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.yearStatus.confirm, {
					year: '2026-2027'
				})
			);
		});

		it('links to the Students importer for the same year', async () => {
			mockQueries({
				'esl/cohorts:list': [G9_COHORT],
				'esl/staff:listAssignable': ASSIGNABLE,
				'esl/yearStatus:readiness': unconfirmed()
			});
			await render(ClassesPage);

			await expect
				.element(page.getByTestId('esl-admin-classes.rosterGate.import'))
				.toHaveAttribute('href', '/esl/admin/students?import=1&year=2026-2027');
		});
	});

	describe('the schedule line', () => {
		it('shows a class with no meetings as empty placeholders', async () => {
			// No "No schedule" text: the card shows the work outstanding as three
			// `?` chips, which are what the admin clicks to start.
			withSchedule([{ ...SOUND_CLIL, meetings: [] }]);
			await render(ClassesPage);

			const cell = page.getByTestId('esl-admin-classes.schedule.class_clil');
			const chips = cell.getByTestId('esl-admin-classes.schedule.chip').elements();
			expect(chips).toHaveLength(3);
			for (const chip of chips) {
				expect(chip.getAttribute('data-chip-state')).toBe('empty');
			}
		});

		it('shows the meetings a class meets as chips', async () => {
			withSchedule([{ ...SOUND_CLIL }]);
			await render(ClassesPage);

			const cell = page.getByTestId('esl-admin-classes.schedule.class_clil');
			await expect.element(cell).toMatchTextContent('Mo P1');
			await expect.element(cell).toMatchTextContent('We P2');
			await expect.element(cell).toMatchTextContent('Fr P3');
		});

		it('marks the card when a clash names another class', async () => {
			withSchedule([
				{
					...SOUND_CLIL,
					problems: [
						{
							kind: 'room',
							message: 'ESL A is taken by G9 Intermediate 1 at this time.',
							day: 'Monday',
							period: 1,
							otherName: 'G9 Intermediate 1'
						}
					]
				}
			]);
			await render(ClassesPage);

			const card = page.getByTestId('esl-admin-classes.card.class_clil');
			await expect.element(card.getByTestId('esl-admin-classes.card.conflict')).toBeInTheDocument();
			const chips = card
				.getByTestId('esl-admin-classes.schedule.chip')
				.elements()
				.map((chip) => chip.getAttribute('data-chip-state'));
			expect(chips).toEqual(['conflict', 'valid', 'valid']);
		});

		it('reads No room on the readout when the room is missing', async () => {
			withSchedule([{ ...SOUND_CLIL, room: null }]);
			await render(ClassesPage);

			const card = page.getByTestId('esl-admin-classes.card.class_clil');
			await expect
				.element(card.getByTestId('esl-admin-classes.room.readout'))
				.toMatchTextContent('No room');
		});

		it('shows no marker at all for a sound schedule', async () => {
			withSchedule([{ ...SOUND_CLIL }]);
			await render(ClassesPage);

			const card = page.getByTestId('esl-admin-classes.card.class_clil');
			await expect.element(card).toMatchTextContent('G7 Basic 1 CLIL');
			expect(card.getByTestId('esl-admin-classes.card.conflict').elements()).toHaveLength(0);
		});
	});

	describe('room assignment', () => {
		/**
		 * The room is authored in the schedule picker, where the draft slots are
		 * visible and the busy marks react to them — one Save writes the week and
		 * the room together. The card face keeps a readout, not a control.
		 */
		it('shows the room on the card readout, with no control beside it', async () => {
			withSchedule([{ ...SOUND_CLIL }]);
			await render(ClassesPage);

			const card = page.getByTestId('esl-admin-classes.card.class_clil');
			await expect
				.element(card.getByTestId('esl-admin-classes.room.readout'))
				.toMatchTextContent('ESL A');
			expect(page.getByTestId('esl-admin-classes.room.select').elements()).toHaveLength(0);
		});

		it('reads "No room" when the class has none', async () => {
			withSchedule([{ ...SOUND_CLIL, room: null }]);
			await render(ClassesPage);

			const card = page.getByTestId('esl-admin-classes.card.class_clil');
			await expect
				.element(card.getByTestId('esl-admin-classes.room.readout'))
				.toMatchTextContent('No room');
		});

		/** Open the CLIL picker's room grid: the only picker on the page. */
		async function openRoomGrid() {
			await page.getByTestId('esl-admin-classes.schedule.toggle').click();
		}

		// ESL classes normally sit in ESL A-G, so choosing is the common act.
		it('offers the department rooms as buttons in the picker', async () => {
			withSchedule([{ ...SOUND_CLIL, room: null }]);
			await render(ClassesPage);

			await openRoomGrid();

			for (const room of ['ESL A', 'ESL B', 'ESL C', 'ESL D', 'ESL E', 'ESL F', 'ESL G']) {
				await expect.element(roomButton(room)).toBeInTheDocument();
			}
		});

		it('saves a picked room with the week in one mutation', async () => {
			withSchedule([{ ...SOUND_CLIL, room: null }]);
			await render(ClassesPage);

			await openRoomGrid();
			await roomButton('ESL C').click();
			await page.getByTestId('esl-admin-classes.schedule.save').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.classes.setSchedule, {
					classId: 'class_clil',
					year: '2025-2026',
					meetings: [
						{ day: 'Monday', period: 1 },
						{ day: 'Wednesday', period: 2 },
						{ day: 'Friday', period: 3 }
					],
					room: 'ESL C'
				})
			);
			// And nothing went through the old room-only path.
			expect(mockMutation.mock.calls.filter(([fn]) => fn === api.esl.classes.setRoom)).toHaveLength(
				0
			);
		});

		// Chinese homerooms are the exception the department reaches for when it runs
		// out of ESL rooms, so they must stay typeable through Other.
		it('saves a typed room from the Other field with the week', async () => {
			withSchedule([{ ...SOUND_CLIL, room: null }]);
			await render(ClassesPage);

			await openRoomGrid();
			await page.getByTestId('esl-admin-classes.schedule.room.other').click();
			await page.getByTestId('esl-admin-classes.schedule.room.input').fill('J101');
			await userEvent.keyboard('{Enter}');
			await page.getByTestId('esl-admin-classes.schedule.save').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.classes.setSchedule, {
					classId: 'class_clil',
					year: '2025-2026',
					meetings: [
						{ day: 'Monday', period: 1 },
						{ day: 'Wednesday', period: 2 },
						{ day: 'Friday', period: 3 }
					],
					room: 'J101'
				})
			);
		});

		it('clears the room by choosing the picked room again with the week', async () => {
			withSchedule([{ ...SOUND_CLIL }]);
			await render(ClassesPage);

			await openRoomGrid();
			await roomButton('ESL A').click();
			await page.getByTestId('esl-admin-classes.schedule.save').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.classes.setSchedule, {
					classId: 'class_clil',
					year: '2025-2026',
					meetings: [
						{ day: 'Monday', period: 1 },
						{ day: 'Wednesday', period: 2 },
						{ day: 'Friday', period: 3 }
					],
					room: ''
				})
			);
		});
	});

	describe('the grade 10 pair save', () => {
		const PAIR_WEEK = [
			{ day: 'Tuesday', period: 5 },
			{ day: 'Thursday', period: 6 }
		];

		/** Both sections scheduled alike, in different rooms. */
		function withPair() {
			withSchedule([
				{
					classId: 'class_h10a',
					name: 'H101A',
					type: 'H10A',
					cohortId: 'cohort_g10a',
					teacherId: null,
					room: 'ESL A',
					meetings: PAIR_WEEK,
					scheduleProblem: null,
					scheduleLabel: null
				},
				{
					classId: 'class_h10b',
					name: 'H101B',
					type: 'H10B',
					cohortId: 'cohort_g10b',
					teacherId: null,
					room: 'ESL B',
					meetings: PAIR_WEEK,
					scheduleProblem: null,
					scheduleLabel: null
				}
			]);
		}

		it('writes both sections in one mutation and names both', async () => {
			// One mutation, not one per section: the server resolves the partner
			// and writes the pair atomically. The notice names both, so it never
			// claims one class was saved when two were.
			withPair();
			await render(ClassesPage);

			await page.getByTestId('esl-admin-classes.schedule.toggle').first().click();
			await page.getByTestId('esl-admin-classes.schedule.save').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.classes.setSchedule, {
					classId: 'class_h10a',
					year: '2025-2026',
					meetings: PAIR_WEEK
				})
			);
			expect(mockMutation).toHaveBeenCalledTimes(1);
			await expect
				.element(page.getByTestId('esl-admin-classes.notice'))
				.toMatchTextContent('Schedule saved for H101A + H101B');
		});
	});

	describe('the mirror confirm', () => {
		/**
		 * A same-type class a save would also write, as the preview query returns
		 * it. The ids are display only — the mutation always sends only the
		 * source class, and the server resolves the group itself.
		 */
		const mirrorTarget = (overrides: Partial<Record<string, unknown>> = {}) => ({
			classId: 'class_mirror_1',
			name: 'G7 Elementary 1 CLIL',
			cohortLabel: '2025-2026 G7 Elementary 1',
			willOverwrite: false,
			problems: [],
			...overrides
		});

		it('lists the classes a save will also write, and sends nothing until confirmed', async () => {
			withSchedule([{ ...SOUND_CLIL }]);
			mockClientQuery.mockResolvedValueOnce({
				targets: [
					mirrorTarget(),
					mirrorTarget({
						classId: 'class_mirror_2',
						name: 'G7 Elementary 2 CLIL',
						willOverwrite: true
					})
				]
			});
			await render(ClassesPage);

			await page.getByTestId('esl-admin-classes.schedule.toggle').first().click();
			await page.getByTestId('esl-admin-classes.schedule.save').click();

			// The confirm names every class, and flags the one that will lose its
			// current week — a cross-class write of seven classes reads as the
			// admin having edited more than the card they opened otherwise.
			await expect
				.element(page.getByTestId('esl-admin-classes.mirrorConfirm'))
				.toMatchTextContent('G7 Elementary 1 CLIL');
			await expect
				.element(page.getByTestId('esl-admin-classes.mirrorConfirm'))
				.toMatchTextContent('G7 Elementary 2 CLIL');
			await expect
				.element(page.getByTestId('esl-admin-classes.mirrorConfirm'))
				.toMatchTextContent('replaces its current week');

			expect(mockMutation).not.toHaveBeenCalled();

			await page.getByTestId('esl-admin-classes.mirrorConfirm.yes').click();

			// One mutation for the whole group, exactly as the grade 10 pair does.
			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.classes.setSchedule, {
					classId: 'class_clil',
					year: '2025-2026',
					meetings: [...SOUND_CLIL.meetings]
				})
			);
			await expect
				.element(page.getByTestId('esl-admin-classes.notice'))
				.toMatchTextContent('+ 2 same-type classes');
		});

		it('cancelling the confirm writes nothing', async () => {
			withSchedule([{ ...SOUND_CLIL }]);
			mockClientQuery.mockResolvedValueOnce({ targets: [mirrorTarget()] });
			await render(ClassesPage);

			await page.getByTestId('esl-admin-classes.schedule.toggle').first().click();
			await page.getByTestId('esl-admin-classes.schedule.save').click();
			await page.getByTestId('esl-admin-classes.mirrorConfirm.no').click();

			expect(mockMutation).not.toHaveBeenCalled();
			expect(page.getByTestId('esl-admin-classes.mirrorConfirm').elements()).toHaveLength(0);
		});

		it('blocks the confirm while any mirror has predicted problems', async () => {
			withSchedule([{ ...SOUND_CLIL }]);
			mockClientQuery.mockResolvedValueOnce({
				targets: [
					mirrorTarget({
						problems: [
							{
								kind: 'cohort-slot',
								message:
									'G7 Elementary 1 CLIL: G7 Elementary 1 Comm draws the same students and already meets then.',
								day: 'Monday',
								period: 1,
								otherName: 'G7 Elementary 1 Comm'
							}
						]
					})
				]
			});
			await render(ClassesPage);

			await page.getByTestId('esl-admin-classes.schedule.toggle').first().click();
			await page.getByTestId('esl-admin-classes.schedule.save').click();

			await expect
				.element(page.getByTestId('esl-admin-classes.mirrorConfirm.problem'))
				.toMatchTextContent('already meets then');
			await expect
				.element(page.getByTestId('esl-admin-classes.mirrorConfirm.blocked'))
				.toBeInTheDocument();
			await expect.element(page.getByTestId('esl-admin-classes.mirrorConfirm.yes')).toBeDisabled();
			expect(mockMutation).not.toHaveBeenCalled();
		});

		it('reports a failed preview and sends nothing', async () => {
			withSchedule([{ ...SOUND_CLIL }]);
			mockClientQuery.mockRejectedValueOnce(new Error('Function not found'));
			await render(ClassesPage);

			await page.getByTestId('esl-admin-classes.schedule.toggle').first().click();
			await page.getByTestId('esl-admin-classes.schedule.save').click();

			await expect
				.element(page.getByTestId('esl-admin-classes.error'))
				.toMatchTextContent('Function not found');
			expect(mockMutation).not.toHaveBeenCalled();
		});
	});

	describe('class teacher assignment', () => {
		it('offers the assignable staff and shows the current teacher', async () => {
			withCohorts();
			await render(ClassesPage);

			const select = page.getByTestId('esl-admin-classes.teacher.class_g9');
			await expect.element(select).toHaveValue('user_t1');
			await expect
				.element(select.getByRole('option', { name: 'Alice Teacher' }))
				.toBeInTheDocument();
			await expect.element(select.getByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
		});

		it('assigns a teacher to an unassigned class', async () => {
			withCohorts();
			await render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.teacher.class_clil'), 'user_t2');

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.classes.assignTeacher, {
					id: 'class_clil',
					teacherId: 'user_t2'
				})
			);
		});

		it('clears a teacher when the empty option is chosen', async () => {
			withCohorts();
			await render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.teacher.class_g9'), '');

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.classes.assignTeacher, {
					id: 'class_g9',
					teacherId: undefined
				})
			);
		});
	});

	describe('year maintenance', () => {
		// A school year ends as a whole: archiving retires every cohort of the
		// year together, behind an explicit confirm — one mis-click among a
		// hundred rows is not a mistake worth risking.
		it('archives a whole year behind a confirm', async () => {
			withCohorts();
			await render(ClassesPage);

			// The oldest year is the default target: the one most likely finished.
			await page.getByTestId('esl-admin-classes.archiveYear').click();
			await expect
				.element(page.getByTestId('esl-admin-classes.archiveConfirm'))
				.toMatchTextContent('2025-2026');

			await page.getByTestId('esl-admin-classes.archiveConfirm.yes').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.cohorts.archiveYear, {
					year: '2025-2026'
				})
			);
		});

		it('cancelling the confirm archives nothing', async () => {
			withCohorts();
			await render(ClassesPage);

			await page.getByTestId('esl-admin-classes.archiveYear').click();
			await page.getByTestId('esl-admin-classes.archiveConfirm.no').click();

			expect(mockMutation).not.toHaveBeenCalledWith(api.esl.cohorts.archiveYear, expect.anything());
			expect(page.getByTestId('esl-admin-classes.archiveConfirm').elements()).toHaveLength(0);
		});

		it('restores an archived year from the lifecycle filter', async () => {
			withCohorts();
			await render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.filter.archived'), 'archived');
			await page.getByTestId('esl-admin-classes.archiveYear').click();
			await page.getByTestId('esl-admin-classes.archiveConfirm.yes').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.cohorts.restoreYear, {
					year: '2025-2026'
				})
			);
		});

		it('surfaces a failed maintenance action', async () => {
			withCohorts();
			mockMutation.mockRejectedValueOnce(new Error('Cohort not found'));
			await render(ClassesPage);

			await page.getByTestId('esl-admin-classes.archiveYear').click();
			await page.getByTestId('esl-admin-classes.archiveConfirm.yes').click();

			await expect
				.element(page.getByTestId('esl-admin-classes.error'))
				.toMatchTextContent('Cohort not found');
		});
	});
});
