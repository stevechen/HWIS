import { ESL_DAYS, ESL_PERIODS, type EslDay } from '$convex/shared/esl';

/** A `(day, period)` pair as the profile query returns it. */
export type TeacherMeeting = { day: string; period: number };

/** The school slot the clock falls in, or null outside class time. */
export type EslSlot = { day: EslDay; period: number };

const TAIPEI = 'Asia/Taipei';

function toMinutes(clock: string): number {
	const [hours, minutes] = clock.split(':').map(Number);
	return hours * 60 + minutes;
}

/** The current weekday and wall-clock minutes in Taiwan. */
export function taipeiNow(now: Date): { weekday: string; minutes: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: TAIPEI,
		weekday: 'long',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).formatToParts(now);
	const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	// `hour12: false` reports midnight as `24`.
	const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
	return { weekday: get('weekday'), minutes };
}

/** Whether the weekday runs ESL lessons at all. */
export function isSchoolDay(weekday: string): weekday is EslDay {
	return (ESL_DAYS as readonly string[]).includes(weekday);
}

/**
 * The timetable slot the clock falls in, or null on weekends, holidays, and
 * between periods. Bounds are start-inclusive and end-exclusive, so a clock
 * exactly on a boundary belongs to the break, not the lesson.
 */
export function currentEslSlot(now: Date): EslSlot | null {
	const { weekday, minutes } = taipeiNow(now);
	if (!isSchoolDay(weekday)) return null;
	const slot = ESL_PERIODS.find(
		(candidate) => toMinutes(candidate.start) <= minutes && minutes < toMinutes(candidate.end)
	);
	if (!slot) return null;
	return { day: weekday, period: slot.period };
}

/** The meeting in progress at the slot, if the teacher has one. */
export function meetingAtSlot(meetings: TeacherMeeting[], slot: EslSlot): TeacherMeeting | null {
	return (
		meetings.find((meeting) => meeting.day === slot.day && meeting.period === slot.period) ?? null
	);
}

/** The teacher's next meeting later today, earliest first. */
export function nextMeetingToday(
	meetings: TeacherMeeting[],
	weekday: string,
	minutes: number
): TeacherMeeting | null {
	const later = meetings
		.filter((meeting) => meeting.day === weekday)
		.filter((meeting) => {
			const slot = ESL_PERIODS.find((candidate) => candidate.period === meeting.period);
			return slot !== undefined && minutes < toMinutes(slot.end);
		})
		.sort((a, b) => a.period - b.period);
	return later[0] ?? null;
}
