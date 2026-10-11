import { describe, it, expect } from 'vitest';
import { calendarClassLabel } from '$src/routes/esl/schedule/calendar/calendar-weeks';

/**
 * Ticket #204: the calendar header/menu must render the corrected short
 * labels deduplicated. The short label already carries the grade (G7–G9) or
 * the whole G10 name, so appending the raw class type repeats it
 * (`G9 Bas. 3 G9`, `H101A H10A`). Only the CLIL/Comm lesson adds information
 * (it tells a cohort's two classes apart), so only it stays suffixed.
 */
describe('calendarClassLabel (short label + type → deduped header)', () => {
	it('keeps the CLIL/Comm lesson so a cohort pair stays distinguishable', () => {
		expect(calendarClassLabel('G7 Ele. 1', 'CLIL')).toBe('G7 Ele. 1 CLIL');
		expect(calendarClassLabel('G8 Ele. 3', 'Comm')).toBe('G8 Ele. 3 Comm');
	});

	it('drops the G9 type token the short label already carries', () => {
		expect(calendarClassLabel('G9 Bas. 3', 'G9')).toBe('G9 Bas. 3');
	});

	it('renders G10 names verbatim with no section suffix', () => {
		expect(calendarClassLabel('H101A', 'H10A')).toBe('H101A');
		expect(calendarClassLabel('H112B', 'H10B')).toBe('H112B');
		expect(calendarClassLabel('H110A', 'H10A')).toBe('H110A');
	});
});
