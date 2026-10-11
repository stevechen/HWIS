import type { Id } from '$convex/_generated/dataModel';
import type { EslDay } from '$convex/shared/esl';

/**
 * The teacher-plus-year every profile availability dialog reads.
 *
 * Bundled so SetAvailabilityDialog and WeeklyScheduleDialog share one prop
 * shape instead of repeating teacherId/teacherName/year together.
 */
export type TeacherYearContext = {
	teacherId: Id<'users'>;
	teacherName: string;
	/** The profile's selected school year — the only year the dialog reads (and, for the editor, writes). */
	year: string;
};

/** One blocked slot as the profile dialogs stage it: day, period, and note. */
export type TeacherAvailabilityBlock = { day: EslDay; period: number; note: string };

/**
 * Shared selector: this teacher's blocks for the year, as stageable slots.
 *
 * One function rather than a filter+map in each dialog, so the two grids
 * cannot drift on what counts as "this teacher's block".
 */
export function selectTeacherBlocks(
	rows: readonly { teacherId: string; day: EslDay; period: number; note?: string }[],
	teacherId: string
): TeacherAvailabilityBlock[] {
	return rows
		.filter((row) => row.teacherId === teacherId)
		.map((row) => ({ day: row.day, period: row.period, note: row.note ?? '' }));
}
