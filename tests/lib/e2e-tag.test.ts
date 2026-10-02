import { describe, it, expect } from 'vitest';
import { e2eTagFromSearch } from '$lib/e2e-tag';

describe('e2eTagFromSearch', () => {
	it('reads the tag a test put on the URL', () => {
		expect(e2eTagFromSearch('?e2eTag=e2e-test_abc123')).toBe('e2e-test_abc123');
	});

	it('is undefined on a real visit, so production rows stay untagged', () => {
		// This is the whole safety property of the seam: absent by default, and
		// present only when a test asks for it. A tag that leaked into an ordinary
		// visit would make a real admin's backup removable by a test teardown.
		expect(e2eTagFromSearch('')).toBeUndefined();
		expect(e2eTagFromSearch('?tab=list')).toBeUndefined();
	});

	it('finds the tag among other query parameters', () => {
		expect(e2eTagFromSearch('?tab=history&e2eTag=e2e-test_xyz&page=2')).toBe('e2e-test_xyz');
	});

	it('decodes a percent-encoded tag', () => {
		expect(e2eTagFromSearch('?e2eTag=e2e-test%20a%2Bb')).toBe('e2e-test a+b');
	});

	it('reads the first occurrence when the parameter is repeated', () => {
		// A duplicated parameter must not silently tag rows with whichever value the
		// browser happened to resolve last.
		expect(e2eTagFromSearch('?e2eTag=first&e2eTag=second')).toBe('first');
	});
});
