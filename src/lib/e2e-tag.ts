/**
 * The tag an end-to-end run passes on the URL, so rows a UI action writes can be
 * removed afterwards by tag (ADR-0004).
 *
 * Read from the query string rather than stored anywhere server-side, so it is
 * present only when a test asks for it and absent from every real visit. Shared by
 * every admin surface that writes test-owned rows, so the seam is defined once
 * instead of per component.
 */
export function e2eTagFromSearch(search: string): string | undefined {
	return new URLSearchParams(search).get('e2eTag') ?? undefined;
}

export function e2eTagFromUrl(): string | undefined {
	if (typeof window === 'undefined') return undefined;
	return e2eTagFromSearch(window.location.search);
}
