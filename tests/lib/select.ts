import type { Locator } from 'vitest/browser';

/**
 * Pick an option in a `<select>` the way a user would.
 *
 * Route tests drive the semester/class pickers this way instead of reaching
 * into `element().value`, because the Svelte components listen for the
 * `change` event rather than reading the bound value directly.
 */
export async function selectOption(select: Locator, value: string): Promise<void> {
	await select.selectOptions(value);
}
