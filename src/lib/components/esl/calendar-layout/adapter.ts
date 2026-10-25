/**
 * CalendarLayout adapter — pure-computation layout module (ADR-0029).
 *
 * Module: CalendarLayout adapter at the seam between calendar fragments
 * and presentation shell. Keeps layout mechanics (sticky toolbar geometry,
 * week scroll target, weekday ordering, month-boundary context) behind a
 * small interface so the TeacherCalendar shell stays thin.
 */

import type { CalendarWeekFragment } from '../../../../routes/esl/schedule/calendar/calendar-weeks';

export interface CalendarClassOption {
	id: string;
	name: string;
	short: string;
	type: string;
	room: string | null;
	headcount: number;
}

export interface CalendarLayoutProps {
	classes: CalendarClassOption[];
	selectedClassId: string;
	fragments: CalendarWeekFragment[];
	today: string;
	nextDate: string | null;
}

export interface CalendarLayoutResult {
	selected: CalendarClassOption | null;
	allWeekdays: string[];
	currentWeek: number;
	targetWeek: number | null;
	showTodayButton: boolean;
}

export function computeCalendarLayout(props: CalendarLayoutProps): CalendarLayoutResult {
	const selected =
		props.classes.find((o: CalendarClassOption) => o.id === props.selectedClassId) ??
		props.classes[0] ??
		null;

	const allWeekdays = Array.from(
		new Set(
			props.fragments.flatMap((f: CalendarWeekFragment) =>
				f.cards.map((c: { weekdayLabel: string }) => c.weekdayLabel)
			)
		)
	).sort(
		(a: string, b: string) =>
			['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(a) -
			['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(b)
	);

	const currentWeek = (() => {
		const hit = props.fragments.find((fragment: CalendarWeekFragment) =>
			fragment.cards.some((card: { date: string }) => card.date >= props.today)
		);
		return (hit ?? props.fragments[props.fragments.length - 1])?.weekIndex ?? 0;
	})();

	return {
		selected,
		allWeekdays,
		currentWeek,
		targetWeek: currentWeek,
		showTodayButton: props.fragments.length > 0
	};
}
