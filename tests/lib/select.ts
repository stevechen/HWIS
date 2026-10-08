import type { Locator } from 'vitest/browser';

/**
 * Chooses an option in a native `<select>`.
 *
 * The browser-mode locators do not expose Playwright's `selectOption`, so the
 * value is set on the element and a bubbling `change` event is dispatched —
 * which is exactly what Svelte's `bind:value` listens for.
 */
export async function selectOption(locator: Locator, value: string): Promise<void> {
	const element = (await locator.element()) as HTMLSelectElement;
	element.value = value;
	element.dispatchEvent(new Event('change', { bubbles: true }));
}
