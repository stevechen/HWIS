import { vi, beforeEach, afterEach } from 'vitest';

if (typeof globalThis.global === 'undefined') {
	(globalThis as typeof globalThis).global = globalThis;
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn()
}));
