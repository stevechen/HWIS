import { page } from 'vitest/browser';

/**
 * The schedule picker's room-grid button for a room name.
 *
 * `data-room` is the lookup rather than the visible text, because a busy button
 * carries the holder's name on a second line — text matching would couple every
 * caller to that layout.
 */
export function roomButton(name: string): HTMLElement {
	const found = page
		.getByTestId('esl-admin-classes.schedule.room')
		.elements()
		.find((el) => el.getAttribute('data-room') === name);
	if (!found) throw new Error(`no room button for ${name}`);
	return found as HTMLElement;
}
