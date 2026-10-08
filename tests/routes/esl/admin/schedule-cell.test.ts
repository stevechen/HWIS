import { page, userEvent } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { roomButton } from '../../../lib/esl-schedule';

import ScheduleCell from '$src/routes/esl/admin/classes/ScheduleCell.svelte';
import ClassCard from '$src/routes/esl/admin/classes/ClassCard.svelte';
import type { EslMeetingInput, EslScheduleProblemDetail } from '$convex/shared/esl';
import type { Id } from '$convex/_generated/dataModel';

/**
 * The picker reads room suggestions through Convex, but only while open — and
 * these tests are about what it *does* with them, not about the query. Canned
 * department rooms plus two homerooms, routed by function like the page suite.
 */
vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: {
			department: ['ESL A', 'ESL B', 'ESL C', 'ESL D', 'ESL E', 'ESL F', 'ESL G'],
			homerooms: ['J101', 'J103']
		},
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

beforeEach(() => {
	vi.clearAllMocks();
});

/**
 * A saved week, deliberately out of week order so the chip-order assertions test
 * the component's sorting rather than the order the fixture happens to use.
 */
const MEETINGS = [
	{ day: 'Wednesday', period: 2 },
	{ day: 'Monday', period: 1 }
] satisfies EslMeetingInput[];

/**
 * A class with a saved, sound week.
 *
 * Shaped by hand rather than mocked from Convex so the suite stays about these
 * components' own behaviour — the chips, the anchor, the dismissal — rather than
 * about what the query returns.
 */
const CLASS_RECORD = {
	classId: 'k17schedulecell' as Id<'esl_classes'>,
	name: 'G9 Advanced 1',
	type: 'G9' as const,
	cohortId: 'k17schedulecell-cohort',
	room: 'ESL A',
	meetings: MEETINGS,
	scheduleProblem: null,
	scheduleLabel: null
};

/** The schedule cell's props, so each test only states what it varies. */
function scheduleProps(over: Record<string, unknown> = {}) {
	return {
		classRecord: CLASS_RECORD,
		year: '2026-2027',
		neighbours: [],
		onsave: vi.fn(),
		...over
	};
}

/** The chips currently on the card, in order. */
function chips() {
	return page.getByTestId('esl-admin-classes.schedule.chip').elements();
}

/** The `data-chip-state` of each chip, in order. */
function chipStates(): (string | null)[] {
	return chips().map((chip) => chip.getAttribute('data-chip-state'));
}

/**
 * Click a chip by index.
 *
 * Via `userEvent` rather than the element's own `click()`, because `elements()`
 * is typed `HTMLElement | SVGElement` and only the former has `.click()`.
 */
async function clickChip(index: number) {
	await userEvent.click(chips()[index]);
}

/**
 * A grade 10 `A` section, whose partner is the matching `B` (ADR-0023 rule 7).
 *
 * Shaped by hand for the same reason as `CLASS_RECORD`: these tests are about what
 * the picker *does* when handed a pair, not about how the query finds one.
 */
const PARTNER = {
	classId: 'k17schedulecell-partner' as Id<'esl_classes'>,
	name: 'H101B',
	cohortId: 'k17schedulecell-partner-cohort'
};

const PAIR_PROPS = {
	classRecord: {
		...CLASS_RECORD,
		classId: 'k17schedulecell-a' as Id<'esl_classes'>,
		name: 'H101A',
		type: 'H10A' as const
	},
	partner: PARTNER
};

describe('ScheduleCell grade 10 pair editing', () => {
	it('announces that saving also schedules the partner', async () => {
		// A cross-class write the UI does not name reads as the admin having edited
		// more than the card they opened.
		render(ScheduleCell, { props: scheduleProps(PAIR_PROPS) });

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.toggle'));
		await expect
			.element(page.getByTestId('esl-admin-classes.schedule.pair'))
			.toHaveTextContent('H101B');
	});

	it('shows no pair notice for a class scheduled alone', async () => {
		render(ScheduleCell, { props: scheduleProps() });

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.toggle'));
		expect(page.getByTestId('esl-admin-classes.schedule.pair').elements()).toHaveLength(0);
	});

	it('writes both sections on save, because the pair shares one week', async () => {
		// The whole rule: there is one week to author, so both ids are written from
		// the one picker rather than reconciled afterwards.
		const onsave = vi.fn();
		render(ScheduleCell, { props: scheduleProps({ ...PAIR_PROPS, onsave }) });

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.toggle'));
		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.save'));

		expect(onsave).toHaveBeenCalledOnce();
		expect(onsave.mock.calls[0][0]).toEqual([PAIR_PROPS.classRecord.classId, PARTNER.classId]);
	});

	it('writes only its own id when it has no partner', async () => {
		const onsave = vi.fn();
		render(ScheduleCell, { props: scheduleProps({ onsave }) });

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.toggle'));
		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.save'));

		expect(onsave.mock.calls[0][0]).toEqual([CLASS_RECORD.classId]);
	});

	it('names both sections on the pair save button', async () => {
		// The button is the notice: it must never claim one class was saved when
		// two were.
		render(ScheduleCell, { props: scheduleProps(PAIR_PROPS) });

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.toggle'));

		await expect
			.element(page.getByTestId('esl-admin-classes.schedule.save'))
			.toHaveTextContent('Save H101A + H101B');
	});

	it('opens a diverged pair on the union, flagged and unsavable until aligned', async () => {
		// The partner meets Mo P1 and Tu P5; this section Mo P1 and We P2. The
		// draft is all three, the two unshared cells are flagged, and Save stays
		// disabled until the draft is one identical set.
		render(ScheduleCell, {
			props: scheduleProps({
				...PAIR_PROPS,
				partner: {
					...PARTNER,
					meetings: [
						{ day: 'Monday', period: 1 },
						{ day: 'Tuesday', period: 5 }
					]
				}
			})
		});

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.toggle'));

		const divergent = page
			.getByTestId('esl-admin-classes.schedule.cell')
			.elements()
			.filter((cell) => cell.getAttribute('data-divergent') === 'true');
		expect(divergent).toHaveLength(2);

		await expect
			.element(page.getByTestId('esl-admin-classes.schedule.impact'))
			.toHaveTextContent('H101B');
		expect(
			page.getByTestId('esl-admin-classes.schedule.save').element().hasAttribute('disabled')
		).toBe(true);
	});

	it('enables the pair save once the draft converges to one set', async () => {
		const onsave = vi.fn();
		render(ScheduleCell, {
			props: scheduleProps({
				...PAIR_PROPS,
				onsave,
				partner: {
					...PARTNER,
					meetings: [
						{ day: 'Monday', period: 1 },
						{ day: 'Tuesday', period: 5 }
					]
				}
			})
		});

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.toggle'));

		// Row-major slots: Tu P5 is index 21. Clearing it leaves the shared
		// Mo P1 + this section's We P2 — one set of two, clean for both.
		const slots = page.getByTestId('esl-admin-classes.schedule.slot').elements();
		await userEvent.click(slots[21]);

		expect(
			page.getByTestId('esl-admin-classes.schedule.save').element().hasAttribute('disabled')
		).toBe(false);

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.save'));
		expect(onsave).toHaveBeenCalledOnce();
		expect(onsave.mock.calls[0][2]).toHaveLength(2);
	});

	it('names the partner slot a converged draft would remove', async () => {
		// Saving one set writes it to both sections, so the partner's dropped
		// Tu P5 is a removal the admin should see before pressing Save.
		render(ScheduleCell, {
			props: scheduleProps({
				...PAIR_PROPS,
				partner: {
					...PARTNER,
					meetings: [
						{ day: 'Monday', period: 1 },
						{ day: 'Tuesday', period: 5 }
					]
				}
			})
		});

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.toggle'));

		const slots = page.getByTestId('esl-admin-classes.schedule.slot').elements();
		await userEvent.click(slots[21]);

		const impact = page.getByTestId('esl-admin-classes.schedule.impact');
		await expect.element(impact).toHaveTextContent('Tu P5');
		await expect.element(impact).toHaveTextContent('H101B');
		await expect.element(impact).toHaveTextContent('removes it');
	});
});

describe('ScheduleCell chips', () => {
	it('shows one chip per required meeting, in week order', async () => {
		// G9 meets twice.
		render(ScheduleCell, { props: scheduleProps() });

		// `.first()` because there are two chips: the chip test id is deliberately
		// shared, so a strict lookup would fail on a page that is working correctly.
		await expect
			.element(page.getByTestId('esl-admin-classes.schedule.chip').first())
			.toBeInTheDocument();
		expect(chipStates()).toEqual(['valid', 'valid']);
		// Whitespace collapsed because the glyph and the label are separate spans
		// separated by a flex gap, so `textContent` carries a space that is not in
		// what the admin reads.
		const text = chips().map((chip) => chip.textContent?.replace(/\s+/g, ' ').trim());
		expect(text).toEqual(['✓ Mo P1', '✓ We P2']);
	});

	it('pads an unscheduled class to its requirement with empty chips', async () => {
		// CLIL meets three times. Nothing saved, so all three slots are placeholders:
		// the card shows the work outstanding rather than appearing to be done.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, type: 'CLIL', meetings: [] }
			})
		});

		expect(chipStates()).toEqual(['empty', 'empty', 'empty']);
		expect(chips().map((chip) => chip.getAttribute('title'))).toEqual([
			'Not yet assigned',
			'Not yet assigned',
			'Not yet assigned'
		]);
	});

	it('separates an empty slot from a valid one without relying on colour', async () => {
		// One of two meetings saved. Red for both would make a half-built year read
		// as a wall of errors rather than a wall of blanks.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, meetings: [{ day: 'Monday', period: 1 }] }
			})
		});

		expect(chipStates()).toEqual(['valid', 'empty']);
		expect(chips()[0].textContent).toContain('✓');
		expect(chips()[1].textContent).not.toContain('✓');
	});

	it('marks only the clashing chip, and names the other class', async () => {
		// The tooltip has to name the class and the slot, not just say "conflict".
		// The wording comes from the gate, which was always going to be a fuller
		// sentence than the badge's "shares its teacher".
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: {
					...CLASS_RECORD,
					scheduleProblem: null,
					problems: [
						{
							kind: 'teacher',
							message: 'G8 Advanced 3 CLIL has the same teacher at this time.',
							day: 'Wednesday',
							period: 2
						}
					]
				}
			})
		});

		expect(chipStates()).toEqual(['valid', 'conflict']);
		expect(chips()[1].getAttribute('title')).toContain('G8 Advanced 3 CLIL');
		expect(chips()[1].getAttribute('title')).toContain('We P2');
	});

	it('turns every clashing chip red, not just the first', async () => {
		// A class double-booked in two slots has two wrong chips. Reading a single
		// problem reddened one of them and left the other looking scheduled, which
		// is how two classes ended up sharing a room with only one chip flagged.
		const problems: EslScheduleProblemDetail[] = [
			{
				kind: 'room',
				message: 'ESL B is taken by G8 Advanced 3 CLIL at this time.',
				day: 'Monday',
				period: 1
			},
			{
				kind: 'room',
				message: 'ESL B is taken by G8 Advanced 3 CLIL at this time.',
				day: 'Wednesday',
				period: 2
			}
		];
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, scheduleProblem: null, problems }
			})
		});

		expect(chipStates()).toEqual(['conflict', 'conflict']);
	});

	it('reddens a cohort clash rather than leaving the save to fail', async () => {
		// A same-roster overlap used to reject the write with a raw server error.
		// It now persists and shows here like any other clash.
		const problems: EslScheduleProblemDetail[] = [
			{
				kind: 'cohort-slot',
				message: 'G7 Pre-Elementary 1 Comm draws the same students and already meets then.',
				day: 'Monday',
				period: 1
			}
		];
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, scheduleProblem: null, problems }
			})
		});

		expect(chipStates()).toEqual(['conflict', 'valid']);
		// The gate's own sentence, which names the class rather than saying only
		// that something "shares its roster".
		expect(chips()[0].getAttribute('title')).toContain('G7 Pre-Elementary 1 Comm');
	});

	it('leaves the chips green for a fault with no slot of its own', async () => {
		// `cohort-teacher` is about the pair, not a meeting, so there is no one chip
		// to redden. The card marker is where it shows.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: {
					...CLASS_RECORD,
					scheduleProblem: null,
					problems: [
						{
							kind: 'cohort-teacher',
							message: 'G7 Pre-Elementary 1 Comm has the same teacher.'
						}
					]
				}
			})
		});

		expect(chipStates()).toEqual(['valid', 'valid']);
	});

	it('keeps the chips green when only the room is missing', async () => {
		// `missing-room` is not a meeting fault: the schedule is sound, and the
		// room control carries that problem in its own border. Marking the chips
		// red would send the admin hunting for a fault that is not in the meetings.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, scheduleProblem: { state: 'missing-room' } }
			})
		});

		expect(chipStates()).toEqual(['valid', 'valid']);
	});
});

describe('ScheduleCell floating picker', () => {
	/**
	 * The `(period, day)` checkbox inputs, indexed row-major.
	 *
	 * The grid renders eight period rows of five days, so the nth input is
	 * `((period - 1) * 5) + dayIndex` — which is what makes a slot addressable without
	 * reaching into the component's internals.
	 */
	function slots() {
		return page.getByTestId('esl-admin-classes.schedule.slot').elements();
	}

	function slotAt(period: number, dayIndex: number) {
		return slots()[(period - 1) * 5 + dayIndex];
	}

	it('moves the day’s lesson when a second period is picked on that day', async () => {
		// A day carries at most one ESL period, so a second pick can only mean "move
		// it". Stacking them instead failed the save with a shape error the admin had
		// to decode, having clicked exactly what they meant.
		const onsave = vi.fn();
		render(ScheduleCell, { props: scheduleProps({ onsave }) });

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		// MEETINGS is Monday P1 and Wednesday P2. Move Monday to P2.
		await userEvent.click(slotAt(2, 0));
		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.save'));

		expect(onsave).toHaveBeenCalledOnce();
		expect(onsave.mock.calls[0][2]).toEqual(
			expect.arrayContaining([
				{ day: 'Monday', period: 2 },
				{ day: 'Wednesday', period: 2 }
			])
		);
		// Still two meetings, not three: the pick replaced rather than added.
		expect(onsave.mock.calls[0][2]).toHaveLength(2);
	});

	it('clears a day’s lesson when its own slot is picked again', async () => {
		const onsave = vi.fn();
		render(ScheduleCell, { props: scheduleProps({ onsave }) });

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();
		await userEvent.click(slotAt(1, 0)); // Monday P1, already picked

		// One meeting short of G9's two, so Save stays disabled — the count is the thing
		// that proves the click cleared rather than re-added it.
		expect(
			page.getByTestId('esl-admin-classes.schedule.save').element().hasAttribute('disabled')
		).toBe(true);
		expect(onsave).not.toHaveBeenCalled();
	});

	it('names the reason a draft cannot be saved, and refuses to save it', async () => {
		// The case the whole panel exists for: a week that looks fine but collides with
		// a neighbour. Save must be disabled *and* say why — a disabled button with no
		// explanation reads as a broken picker. One line: slot, class, room.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, room: 'ESL A' },
				neighbours: [
					{
						classId: 'other',
						className: 'G8 Advanced 3 Comm',
						cohortId: 'other-cohort',
						room: 'ESL A',
						teacherId: 'teacher_other',
						// Holds Monday P1, which this class also holds.
						meetings: [{ day: 'Monday', period: 1 }]
					}
				]
			})
		});

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const impact = page.getByTestId('esl-admin-classes.schedule.impact');
		await expect.element(impact).toHaveTextContent('Mo P1 - G8 Advanced 3 Comm @ESL A');

		expect(
			page.getByTestId('esl-admin-classes.schedule.save').element().hasAttribute('disabled')
		).toBe(true);
	});

	it('turns a conflicting pick red at staging, with all four sides showing', async () => {
		// Red is a verdict about this cell: the draft holds Mo P1 while the
		// neighbour teaches it in the same room. The clean We P2 pick stays
		// emerald. Both lift above the shared dividers so their borders read
		// whole rather than eaten by the neighbour.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, room: 'ESL A' },
				neighbours: [
					{
						classId: 'other',
						className: 'G8 Advanced 3 Comm',
						cohortId: 'other-cohort',
						room: 'ESL A',
						teacherId: 'teacher_other',
						meetings: [{ day: 'Monday', period: 1 }]
					}
				]
			})
		});

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const cells = page.getByTestId('esl-admin-classes.schedule.cell').elements();
		// Row-major: index 0 is P1/Monday (conflicting), index 7 is P2/Wednesday
		// (selected and clean).
		const clashing = cells[0];
		const clean = cells[7];
		expect(clashing.getAttribute('data-conflict')).toBe('true');
		expect(clashing.className).toContain('bg-red-100');
		expect(clashing.className).toContain('z-10');
		expect(clean.getAttribute('data-conflict')).toBe('false');
		expect(clean.className).toContain('z-10');
		expect(clean.className).not.toContain('bg-red-100');
	});

	it('marks the colliding cell blocked and leaves it visible', async () => {
		// A cell that vanished would look like a broken grid; the admin would hunt for
		// a slot they can actually click.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, room: 'ESL A' },
				neighbours: [
					{
						classId: 'other',
						className: 'G8 Advanced 3 Comm',
						cohortId: 'other-cohort',
						room: 'ESL A',
						teacherId: 'teacher_other',
						meetings: [{ day: 'Monday', period: 1 }]
					}
				]
			})
		});

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const cells = page.getByTestId('esl-admin-classes.schedule.cell').elements();
		// 8 periods x 5 days = 40 cells, all present.
		expect(cells).toHaveLength(40);
		// Row-major, so index 0 is P1/Monday — the held slot — and index 1 is
		// P1/Tuesday, which nothing claims.
		expect(cells[0].getAttribute('data-blocked')).toBe('true');
		expect(cells[1].getAttribute('data-blocked')).toBe('false');
	});

	it('labels teacher-unavailable slots NA, quoting the note in the tooltip', async () => {
		// Display text only: the NA block still refuses the save through the
		// unchanged gate, and the cell reads NA with the note on hover.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, teacherId: 'k17teacher' },
				availabilityByTeacher: {
					k17teacher: [{ day: 'Thursday', period: 3, note: 'lunch duty' }]
				}
			})
		});

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const cells = page.getByTestId('esl-admin-classes.schedule.cell').elements();
		// Row-major: Th P3 is period index 2 times five days plus day index 3.
		const na = cells[2 * 5 + 3];
		await expect.element(na).toHaveTextContent('NA');
		expect(na.getAttribute('title')).toContain('lunch duty');
		// A free slot stays blank.
		expect(cells[1].textContent?.trim()).toBe('');
	});

	it('leaves slots blocked for other reasons blank rather than NA', async () => {
		// NA names the teacher-availability rule only: a room clash keeps its
		// blank cell, with the reason in the tooltip.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, room: 'ESL A' },
				neighbours: [
					{
						classId: 'other',
						className: 'G8 Advanced 3 Comm',
						cohortId: 'other-cohort',
						room: 'ESL A',
						teacherId: 'teacher_other',
						meetings: [{ day: 'Monday', period: 1 }]
					}
				]
			})
		});

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const cells = page.getByTestId('esl-admin-classes.schedule.cell').elements();
		expect(cells[0].getAttribute('data-blocked')).toBe('true');
		expect(cells[0].textContent?.trim()).toBe('');
	});

	it('resolves a blocked draft with one click of Find free slots', async () => {
		const onsave = vi.fn();
		render(ScheduleCell, {
			props: scheduleProps({
				onsave,
				classRecord: { ...CLASS_RECORD, room: 'ESL A' },
				neighbours: [
					{
						classId: 'other',
						className: 'G8 Advanced 3 Comm',
						cohortId: 'other-cohort',
						room: 'ESL A',
						teacherId: 'teacher_other',
						meetings: [{ day: 'Monday', period: 1 }]
					}
				]
			})
		});

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();
		const impact = page.getByTestId('esl-admin-classes.schedule.impact');
		await expect.element(impact).toHaveTextContent('G8 Advanced 3 Comm');

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.suggest'));

		// Cleared: the impact line reads clean, and Save is live again.
		await expect.element(impact).toHaveTextContent('No conflicts');
		expect(
			page.getByTestId('esl-admin-classes.schedule.save').element().hasAttribute('disabled')
		).toBe(false);

		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.save'));
		expect(onsave).toHaveBeenCalledOnce();
	});

	it('keeps the row height unchanged when the picker opens', async () => {
		render(ScheduleCell, { props: scheduleProps() });

		const row = page.getByTestId(`esl-admin-classes.schedule.${CLASS_RECORD.classId}`).element();
		const before = row.getBoundingClientRect().height;
		expect(before).toBeGreaterThan(0);

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		// The eight period rows are ~300px tall. If any of them were still in flow
		// this height would jump by roughly that much.
		expect(row.getBoundingClientRect().height).toBe(before);
	});

	it('opens from anywhere on the schedule line, not just the icon', async () => {
		render(ScheduleCell, { props: scheduleProps() });

		// The strip's job is "open this class's picker"; an admin should not have
		// to work out which of two small things is the button.
		await clickChip(0);

		await expect.element(page.getByTestId('esl-admin-classes.schedule.editor')).toBeInTheDocument();
	});

	it('takes the panel out of flow, so it overlays rather than expands', async () => {
		render(ScheduleCell, { props: scheduleProps() });
		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const panel = page.getByTestId('esl-admin-classes.schedule.editor').element();
		// `fixed` rather than `static`/`relative` is what keeps the card's geometry
		// stable; the no-anchor-support fallback is `absolute`, also out of flow.
		expect(['fixed', 'absolute']).toContain(getComputedStyle(panel).position);
	});

	it('pins the panel under its trigger without moving the card', async () => {
		render(ScheduleCell, { props: scheduleProps() });
		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const toggle = page.getByTestId('esl-admin-classes.schedule.toggle').element();
		const panel = page.getByTestId('esl-admin-classes.schedule.editor').element();
		const toggleBox = toggle.getBoundingClientRect();
		const panelBox = panel.getBoundingClientRect();
		// Out of flow, opening just below the strip it belongs to.
		expect(['absolute', 'fixed']).toContain(getComputedStyle(panel).position);
		expect(panelBox.top).toBeGreaterThanOrEqual(toggleBox.bottom);
		expect(panelBox.left).toBeGreaterThanOrEqual(toggleBox.left - 1);
		// Above the sticky site header, so a panel flipped upward keeps its
		// shadow — and its clicks — instead of sliding underneath it.
		expect(getComputedStyle(panel).zIndex).toBe('1100');
	});

	it('names the trigger as an anchor, unique per class', async () => {
		render(ScheduleCell, { props: scheduleProps() });

		const toggle = page.getByTestId('esl-admin-classes.schedule.toggle').element();
		// Anchor positioning resolves by name, so a shared name would tie two rows'
		// panels to the same button.
		expect(getComputedStyle(toggle).getPropertyValue('anchor-name')).toContain(
			String(CLASS_RECORD.classId)
		);
	});

	it('closes on Escape and returns focus to the trigger', async () => {
		render(ScheduleCell, { props: scheduleProps() });

		const toggle = page.getByTestId('esl-admin-classes.schedule.toggle');
		await toggle.click();
		await expect.element(page.getByTestId('esl-admin-classes.schedule.editor')).toBeInTheDocument();

		await clickChip(0);
		await userEvent.keyboard('{Escape}');

		await expect
			.element(page.getByTestId('esl-admin-classes.schedule.editor'))
			.not.toBeInTheDocument();
		// Focus must not be stranded on a removed element, or the next Tab starts
		// from the top of the document.
		expect(document.activeElement).toBe(toggle.element());
	});

	it('reports its expanded state to assistive tech', async () => {
		render(ScheduleCell, { props: scheduleProps() });

		const toggle = page.getByTestId('esl-admin-classes.schedule.toggle');
		await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');

		await toggle.click();
		await expect.element(toggle).toHaveAttribute('aria-expanded', 'true');
	});
});

describe('ScheduleCell room grid', () => {
	/** The neighbour set where another cohort's class holds ESL A at Mo P1. */
	function heldRoomNeighbours() {
		return [
			{
				classId: 'other',
				className: 'G8 Advanced 3 Comm',
				cohortId: 'other-cohort',
				room: 'ESL A',
				teacherId: 'teacher_other',
				meetings: [{ day: 'Monday', period: 1 }]
			}
		];
	}

	it('offers department rooms then homerooms, single-select', async () => {
		render(ScheduleCell, { props: scheduleProps() });

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const names = page
			.getByTestId('esl-admin-classes.schedule.room')
			.elements()
			.map((el) => el.getAttribute('data-room'));
		// Department rooms first, in corridor order, then the derived homerooms.
		expect(names.slice(0, 7)).toEqual([
			'ESL A',
			'ESL B',
			'ESL C',
			'ESL D',
			'ESL E',
			'ESL F',
			'ESL G'
		]);
		expect(names.slice(7)).toEqual(['J101', 'J103']);
		// The saved room starts selected: one gesture, not a re-pick.
		expect(roomButton('ESL A').getAttribute('aria-pressed')).toBe('true');
	});

	it('sends the picked room with the week, and nothing when unchanged', async () => {
		const onsave = vi.fn();
		render(ScheduleCell, { props: scheduleProps({ onsave }) });

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();
		await userEvent.click(roomButton('ESL B'));
		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.save'));

		expect(onsave).toHaveBeenCalledOnce();
		expect(onsave.mock.calls[0][3]).toBe('ESL B');
	});

	it('sends no room when only the slots changed', async () => {
		// Absent means "leave it": a slots-only edit must not rewrite the room or
		// re-trigger the room rule.
		const onsave = vi.fn();
		render(ScheduleCell, { props: scheduleProps({ onsave }) });

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();
		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.save'));

		expect(onsave).toHaveBeenCalledOnce();
		expect(onsave.mock.calls[0][3]).toBeUndefined();
	});

	it('marks the held room busy, naming holder and slot', async () => {
		// The draft holds Mo P1 in ESL A, which the neighbour already teaches in
		// ESL A — so the button says so, rather than failing the save later.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, room: 'ESL B' },
				neighbours: heldRoomNeighbours()
			})
		});

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const button = roomButton('ESL A');
		expect(button.getAttribute('data-busy')).toBe('true');
		await expect.element(button).toHaveTextContent('G8 Advanced 3 Comm');
		await expect.element(button).toHaveTextContent('Mo P1');
		expect(roomButton('ESL B').getAttribute('data-busy')).toBe('false');
	});

	it('clears the busy mark when the draft moves off the held slot', async () => {
		// Busy is draft ∩ saved: moving Monday's lesson away frees ESL A again,
		// with no save in between.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, room: 'ESL B' },
				neighbours: heldRoomNeighbours()
			})
		});

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();
		expect(roomButton('ESL A').getAttribute('data-busy')).toBe('true');

		// Monday P1 is slots index 0; clicking it clears Monday's lesson.
		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.slot').elements()[0]);
		expect(roomButton('ESL A').getAttribute('data-busy')).toBe('false');
	});

	it('keeps a persistent impact line, clean and clashing', async () => {
		render(ScheduleCell, { props: scheduleProps() });

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();
		await expect
			.element(page.getByTestId('esl-admin-classes.schedule.impact'))
			.toHaveTextContent('No conflicts');
	});

	it('names the disturbed class and room on the impact line', async () => {
		// Slot, class, room — the one line the panel states, with the full
		// sentence living only in the cell tooltip.
		render(ScheduleCell, {
			props: scheduleProps({
				classRecord: { ...CLASS_RECORD, room: 'ESL A' },
				neighbours: heldRoomNeighbours()
			})
		});

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const impact = page.getByTestId('esl-admin-classes.schedule.impact');
		await expect.element(impact).toHaveTextContent('Mo P1 - G8 Advanced 3 Comm @ESL A');
		await expect.element(impact).not.toHaveTextContent('is taken by');
	});

	it('reveals the Other field and saves the typed room', async () => {
		const onsave = vi.fn();
		render(ScheduleCell, { props: scheduleProps({ onsave }) });

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();
		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.room.other'));

		const input = page.getByTestId('esl-admin-classes.schedule.room.input');
		await expect.element(input).toBeInTheDocument();
		await userEvent.fill(input.element(), 'Library');
		await userEvent.keyboard('{Enter}');
		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.save'));

		expect(onsave).toHaveBeenCalledOnce();
		expect(onsave.mock.calls[0][3]).toBe('Library');
	});

	it('clears the room by choosing the picked room again', async () => {
		// Toggle-off, like the slot cells: no separate clear control. The saved
		// room starts selected, so one click empties the draft.
		const onsave = vi.fn();
		render(ScheduleCell, { props: scheduleProps({ onsave }) });

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();
		const picked = page
			.getByTestId('esl-admin-classes.schedule.room')
			.elements()
			.find((el) => el.getAttribute('data-room') === 'ESL A');
		if (!picked) throw new Error('no room button for ESL A');
		await userEvent.click(picked);
		await userEvent.click(page.getByTestId('esl-admin-classes.schedule.save'));

		expect(onsave).toHaveBeenCalledOnce();
		expect(onsave.mock.calls[0][3]).toBe('');
	});
});

describe('ScheduleCell keyboard grid', () => {
	function slots() {
		return page.getByTestId('esl-admin-classes.schedule.slot').elements();
	}

	it('moves across the slot grid with arrow keys, space toggles', async () => {
		render(ScheduleCell, { props: scheduleProps() });

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		(slots()[0] as HTMLElement).focus();
		await userEvent.keyboard('{ArrowRight}');
		expect(document.activeElement?.getAttribute('id')).toBe(
			`slot-${CLASS_RECORD.classId}-Tuesday-1`
		);

		await userEvent.keyboard('{ArrowDown}');
		expect(document.activeElement?.getAttribute('id')).toBe(
			`slot-${CLASS_RECORD.classId}-Tuesday-2`
		);

		await userEvent.keyboard('{ArrowLeft}');
		expect(document.activeElement?.getAttribute('id')).toBe(
			`slot-${CLASS_RECORD.classId}-Monday-2`
		);

		await userEvent.keyboard('{ArrowUp}');
		expect(document.activeElement?.getAttribute('id')).toBe(
			`slot-${CLASS_RECORD.classId}-Monday-1`
		);
	});

	it('steps between room buttons with arrow keys', async () => {
		render(ScheduleCell, { props: scheduleProps() });

		await page.getByTestId('esl-admin-classes.schedule.toggle').click();

		const first = page
			.getByTestId('esl-admin-classes.schedule.room')
			.elements()
			.find((el) => el.getAttribute('data-room') === 'ESL A') as HTMLElement;
		first.focus();
		await userEvent.keyboard('{ArrowRight}');
		expect(document.activeElement?.getAttribute('data-room')).toBe('ESL B');
	});
});

describe('ClassCard', () => {
	/** The card's class row, named so a test can vary one field of it. */
	const CARD_CLASS = {
		_id: CLASS_RECORD.classId,
		name: CLASS_RECORD.name,
		type: CLASS_RECORD.type,
		teacherId: undefined as Id<'users'> | null | undefined,
		cohortId: 'k17cohort' as Id<'esl_cohorts'>
	};

	/** The card's props, so each test only states what it varies. */
	function cardProps(over: Record<string, unknown> = {}) {
		return {
			classRow: { ...CARD_CLASS },
			year: '2026-2027',
			slug: '26-27_G9-Advanced-1_G9',
			schedule: { meetings: MEETINGS, room: 'ESL A', scheduleProblem: null, problems: [] },
			neighbours: [],
			studentCount: 0,
			partner: null,
			staff: [],
			onsave: vi.fn(),
			onteacher: vi.fn(),
			...over
		};
	}

	it('carries a stable test id and a readable slug', async () => {
		render(ClassCard, { props: cardProps() });

		const card = page.getByTestId(`esl-admin-classes.card.${CLASS_RECORD.classId}`).element();
		expect(card).toBeTruthy();
		// The slug is for reading the DOM; the id is what tests key on, because the
		// name and the year both change over a class's life.
		expect(card.getAttribute('data-class-slug')).toBe('26-27_G9-Advanced-1_G9');
	});

	it('shows the room on the card face, not only inside the picker', async () => {
		// The room used to be reachable only behind the schedule disclosure, which
		// meant a "Missing room" badge named a problem with no visible way to fix it.
		render(ClassCard, { props: cardProps() });

		await expect
			.element(page.getByTestId('esl-admin-classes.room.readout'))
			.toHaveTextContent('ESL A');
	});

	it('offers no room control on the card face', async () => {
		// The room is authored in the schedule picker, where the draft slots are
		// visible and the busy marks react to them. Editing it beside a week it
		// cannot see is how clashes were discovered only after saving.
		render(ClassCard, { props: cardProps() });

		expect(page.getByTestId('esl-admin-classes.room.select').elements()).toHaveLength(0);
		expect(page.getByTestId('esl-admin-classes.room.input').elements()).toHaveLength(0);
	});

	it('reads No room grey-dashed when the schedule is sound but unroomed', async () => {
		render(ClassCard, {
			props: cardProps({
				schedule: {
					meetings: MEETINGS,
					room: null,
					scheduleProblem: { state: 'missing-room' },
					problems: []
				}
			})
		});

		const readout = page.getByTestId('esl-admin-classes.room.readout');
		await expect.element(readout).toHaveTextContent('No room');
		// The chips' `empty` grey, not a colour of its own: one card, one language.
		expect(readout.element().className).toContain('text-muted-foreground');
	});

	it('reads No room grey-dashed even when the class has no schedule yet', async () => {
		// `missing-room` is the *schedule's* verdict, so a class with no schedule is
		// reported `no-schedule` and never `missing-room`. Reading the badge alone would
		// paint a roomless, unscheduled class as settled.
		render(ClassCard, {
			props: cardProps({
				schedule: {
					meetings: [],
					room: null,
					scheduleProblem: { state: 'no-schedule' },
					problems: []
				}
			})
		});

		const readout = page.getByTestId('esl-admin-classes.room.readout');
		await expect.element(readout).toHaveTextContent('No room');
		expect(readout.element().className).toContain('text-muted-foreground');
	});

	it('marks the teacher select grey-dashed while it is unassigned', async () => {
		render(ClassCard, { props: cardProps({ classRow: { ...CARD_CLASS, teacherId: null } }) });

		expect(
			page.getByTestId(`esl-admin-classes.teacher.${CARD_CLASS._id}`).element().className
		).toContain('border-dashed');
	});

	it('marks the teacher select emerald once a teacher is assigned', async () => {
		// A separate test from the grey-dashed case: two `render` calls in one test leave the
		// first card in the document, and the shared test id would match that one.
		render(ClassCard, {
			props: cardProps({
				classRow: { ...CARD_CLASS, teacherId: 'k17teacher' as Id<'users'> }
			})
		});

		expect(
			page.getByTestId(`esl-admin-classes.teacher.${CARD_CLASS._id}`).element().className
		).toContain('border-emerald-600');
	});

	it('marks a card that carries an unresolved conflict', async () => {
		// The marker covers conflicts the admin did not cause: a class is never
		// re-saved when a *neighbour* breaks it, so nothing else on the card would
		// change to tell them.
		render(ClassCard, {
			props: cardProps({
				schedule: {
					meetings: MEETINGS,
					room: 'ESL A',
					scheduleProblem: null,
					problems: [
						{
							kind: 'room',
							message: 'ESL A is taken by G8 Advanced 3 Comm.',
							day: 'Monday',
							period: 1
						}
					]
				}
			})
		});

		await expect
			.element(page.getByTestId('esl-admin-classes.card.conflict'))
			.toHaveTextContent('!');
	});

	it('leaves a clean card unmarked', async () => {
		render(ClassCard, { props: cardProps() });

		expect(page.getByTestId('esl-admin-classes.card.conflict').elements()).toHaveLength(0);
	});

	it('shows the roster size beside the room', async () => {
		// Both classes of a cohort teach one roster, so this is a cohort figure —
		// which is the point: a room's capacity is only meaningful against how many
		// people are in it.
		render(ClassCard, { props: cardProps({ studentCount: 22 }) });

		await expect.element(page.getByTestId('esl-admin-classes.students')).toHaveTextContent('22');
	});

	it('shows the whole class name, wrapping rather than truncating', async () => {
		// `truncate` was cutting `G7 Pre-Elementary 1 CLIL` to `G7 Pre-Elementary 1
		// Co…`, which removes exactly the part that tells two classes apart.
		const longest = 'G7 Pre-Elementary 1 CLIL';
		render(ClassCard, {
			props: cardProps({
				classRow: {
					_id: CLASS_RECORD.classId,
					name: longest,
					type: 'CLIL',
					teacherId: undefined
				}
			})
		});

		const heading = page
			.getByTestId(`esl-admin-classes.card.${CLASS_RECORD.classId}`)
			.element()
			.querySelector('h4');

		expect(heading?.textContent?.trim()).toBe(longest);
		expect(heading?.className).not.toContain('truncate');
	});
});

describe('ClassCard availability dialog', () => {
	/** A card with Ms Rao assigned, one saved block, and a neighbour she teaches. */
	function availabilityProps(over: Record<string, unknown> = {}) {
		return {
			classRow: {
				_id: CLASS_RECORD.classId,
				name: CLASS_RECORD.name,
				type: CLASS_RECORD.type,
				teacherId: 'k17teacher' as Id<'users'>,
				cohortId: 'k17cohort' as Id<'esl_cohorts'>
			},
			year: '2026-2027',
			slug: '26-27_G9-Advanced-1_G9',
			schedule: { meetings: MEETINGS, room: 'ESL A', scheduleProblem: null, problems: [] },
			neighbours: [
				{
					classId: 'k17neighbour',
					className: 'G7 Basic 1 Comm',
					cohortId: 'k17other-cohort',
					teacherId: 'k17teacher',
					room: 'ESL B',
					meetings: [{ day: 'Tuesday' as const, period: 5 }]
				}
			],
			studentCount: 0,
			partner: null,
			staff: [{ _id: 'k17teacher' as Id<'users'>, name: 'Ms Rao' }],
			availabilityByTeacher: {
				k17teacher: [{ day: 'Monday' as const, period: 1, note: 'lunch duty' }]
			},
			onsave: vi.fn(),
			onteacher: vi.fn(),
			...over
		};
	}

	it('sits beside the teacher select once a teacher is assigned', async () => {
		// Blocking a slot is one step from assigning: the dialog opens from the
		// card, not from a page elsewhere.
		render(ClassCard, { props: availabilityProps() });

		const trigger = page.getByTestId('esl-admin-classes.availability.trigger');
		await expect.element(trigger).toBeInTheDocument();
		await expect.element(trigger).toHaveAttribute('aria-label', 'Availability for Ms Rao');
	});

	it('shows no dialog trigger while the class is unassigned', async () => {
		// No teacher, nobody to block.
		render(ClassCard, {
			props: availabilityProps({
				classRow: {
					_id: CLASS_RECORD.classId,
					name: CLASS_RECORD.name,
					type: CLASS_RECORD.type,
					teacherId: null,
					cohortId: 'k17cohort' as Id<'esl_cohorts'>
				}
			})
		});

		expect(page.getByTestId('esl-admin-classes.availability.trigger').elements()).toHaveLength(0);
	});

	/** The cells currently marked blocked. */
	function blockedCells() {
		return page
			.getByTestId('esl-admin-classes.availability.cell')
			.elements()
			.filter((cell) => cell.getAttribute('data-blocked') === 'true');
	}

	it('opens on the saved blocks, shown read-only with the note beside each', async () => {
		// Display, not editing: blocked slots read as checked and disabled, and
		// the note is text — there is nothing here that writes.
		render(ClassCard, { props: availabilityProps() });

		await userEvent.click(page.getByTestId('esl-admin-classes.availability.trigger'));

		await expect
			.element(page.getByTestId('esl-admin-classes.availability.dialog'))
			.toBeInTheDocument();
		expect(blockedCells()).toHaveLength(1);

		const inputs = page.getByTestId('esl-admin-classes.availability.slot').elements();
		for (const input of inputs) {
			expect((input as HTMLInputElement).disabled).toBe(true);
		}

		const notes = page.getByTestId('esl-admin-classes.availability.note').elements();
		expect(notes).toHaveLength(1);
		await expect.element(notes[0]).toHaveTextContent('lunch duty');
	});

	it('marks the slots the teacher already teaches, naming the class', async () => {
		// Assigned hours mark the grid like blocks do: a teacher in one room
		// cannot take another class then. Own meetings (Mo P1, We P2) and the
		// neighbour's (Tu P5) all read gray, each naming its holder.
		render(ClassCard, { props: availabilityProps() });

		await userEvent.click(page.getByTestId('esl-admin-classes.availability.trigger'));

		const taught = page
			.getByTestId('esl-admin-classes.availability.cell')
			.elements()
			.filter((cell) => cell.getAttribute('data-taught') !== null);
		expect(taught.map((cell) => cell.getAttribute('data-taught')).sort()).toEqual([
			'G7 Basic 1 Comm',
			'G9 Advanced 1',
			'G9 Advanced 1'
		]);
		const holder = taught.find((cell) => cell.getAttribute('data-taught') === 'G7 Basic 1 Comm');
		if (!holder) throw new Error('no taught cell for G7 Basic 1 Comm');
		expect(holder.getAttribute('title')).toContain('teaches G7 Basic 1 Comm');
	});

	it('offers no editing controls: nothing here writes', async () => {
		render(ClassCard, { props: availabilityProps() });

		await userEvent.click(page.getByTestId('esl-admin-classes.availability.trigger'));

		// No staged summary, no Save, no Discard — blocking is done elsewhere.
		expect(page.getByTestId('esl-admin-classes.availability.staged').elements()).toHaveLength(0);
		expect(page.getByTestId('esl-admin-classes.availability.save').elements()).toHaveLength(0);
		expect(page.getByTestId('esl-admin-classes.availability.discard').elements()).toHaveLength(0);
	});

	it('leaves the blocks untouched when a cell is clicked', async () => {
		// Clicking the label, the way a user would: a disabled checkbox takes
		// no input, so the grid still shows exactly the one saved block.
		render(ClassCard, { props: availabilityProps() });

		await userEvent.click(page.getByTestId('esl-admin-classes.availability.trigger'));

		const cells = page.getByTestId('esl-admin-classes.availability.cell').elements();
		await userEvent.click(cells[cells.length - 1]);

		expect(blockedCells()).toHaveLength(1);
	});

	it('tags taught slots with grade, level and number, full name on hover', async () => {
		// No list: a teacher with ten classes would grow the dialog past the
		// viewport. Each taught cell carries its short tag instead, with the
		// full class name in the tooltip for collisions.
		render(ClassCard, { props: availabilityProps() });

		await userEvent.click(page.getByTestId('esl-admin-classes.availability.trigger'));

		expect(page.getByTestId('esl-admin-classes.availability.context').elements()).toHaveLength(0);

		const cells = page.getByTestId('esl-admin-classes.availability.cell').elements();
		const texts = cells.map((cell) => cell.textContent?.trim() ?? '').filter((text) => text !== '');
		// Own Advanced meetings plus the neighbour's Basic one.
		expect(texts.sort()).toEqual(['G7 Bas. 1', 'G9 Adv. 1', 'G9 Adv. 1']);
	});

	it('reads a blocked non-teaching slot as NA, quoting the note in the tooltip', async () => {
		// Thursday P3 is blocked and taught by nobody: it reads NA rather than
		// blank, with the note on hover exactly as the picker refusal quotes it.
		render(ClassCard, {
			props: availabilityProps({
				availabilityByTeacher: {
					k17teacher: [{ day: 'Thursday' as const, period: 3, note: 'lunch duty' }]
				}
			})
		});

		await userEvent.click(page.getByTestId('esl-admin-classes.availability.trigger'));

		const blocked = blockedCells();
		expect(blocked).toHaveLength(1);
		await expect.element(blocked[0]).toHaveTextContent('NA');
		expect(blocked[0].getAttribute('title')).toContain('lunch duty');
	});

	it('keeps the class tag, not NA, where a block overlaps a taught slot', async () => {
		// The default fixture blocks Mo P1, which the class itself teaches: the
		// cell keeps the class tag so the two busy reasons stay distinct.
		render(ClassCard, { props: availabilityProps() });

		await userEvent.click(page.getByTestId('esl-admin-classes.availability.trigger'));

		const blocked = blockedCells();
		expect(blocked).toHaveLength(1);
		await expect.element(blocked[0]).toHaveTextContent('G9 Adv. 1');
		await expect.element(blocked[0]).not.toHaveTextContent('NA');
	});
});

describe('ClassCard script hygiene', () => {
	it('leaks no script text into the page', async () => {
		// A `} = $props();` or a stray `const` sitting outside the `<script>` block is
		// valid markup to Svelte — it just renders as visible text under every card,
		// which typecheck and the functional assertions above both sail straight
		// past. This is the one assertion that notices.
		render(ClassCard, {
			props: {
				classRow: {
					_id: CLASS_RECORD.classId,
					name: CLASS_RECORD.name,
					type: CLASS_RECORD.type,
					teacherId: undefined,
					cohortId: 'k17cohort' as Id<'esl_cohorts'>
				},
				year: '2026-2027',
				slug: '26-27_G9-Advanced-1_G9',
				schedule: { meetings: MEETINGS, room: 'ESL A', scheduleProblem: null, problems: [] },
				neighbours: [],
				studentCount: 0,
				partner: null,
				staff: [],
				onsave: vi.fn(),
				onteacher: vi.fn()
			}
		});

		const text = document.body.textContent ?? '';
		expect(text).not.toContain('$props');
		expect(text).not.toContain('$derived');
		expect(text).not.toContain('$state(');
		expect(text).not.toMatch(/\bconst\s+\w+\s*=/);
	});
});
