import { describe, it, expect } from 'vitest';
import { compressResults } from './test-compressor';

const allPassFixture = {
	stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0, ok: true },
	suites: [
		{
			title: 'chromium',
			specs: [
				{
					title: 'passes the first test',
					file: 'e2e/first.spec.ts',
					line: 10,
					column: 2,
					tests: [{ status: 'passed', expectedStatus: 'passed', errors: [] }]
				}
			],
			suites: [
				{
					title: 'nested suite',
					specs: [
						{
							title: 'passes the second test',
							file: 'e2e/second.spec.ts',
							line: 42,
							column: 5,
							tests: [{ status: 'passed', expectedStatus: 'passed', errors: [] }]
						}
					]
				}
			]
		}
	]
};

const twoFailuresFixture = {
	stats: { expected: 1, unexpected: 2, flaky: 0, skipped: 0, ok: false },
	suites: [
		{
			title: 'chromium',
			specs: [
				{
					title: 'passes fine',
					file: 'e2e/passing.spec.ts',
					line: 10,
					column: 2,
					tests: [{ status: 'passed', expectedStatus: 'passed', errors: [] }]
				}
			],
			suites: [
				{
					title: 'sub-suite',
					specs: [
						{
							title: 'fails with assertion',
							file: 'e2e/failing.spec.ts',
							line: 42,
							column: 5,
							tests: [
								{
									status: 'failed',
									expectedStatus: 'passed',
									errors: [
										{
											message: "Error: expect(received).toBe(expected) — expected 'bar' got 'foo'",
											stack: `Error: expect(received).toBe(expected) — expected 'bar' got 'foo'
    at <anonymous> (e2e/failing.spec.ts:45:18)
    at Proxy.<anonymous> (file:///node_modules/playwright/lib/index.js:100:10)`
										}
									]
								}
							]
						},
						{
							title: 'times out',
							file: 'e2e/slow.spec.ts',
							line: 99,
							column: 3,
							tests: [
								{
									status: 'failed',
									expectedStatus: 'passed',
									errors: [
										{
											message: 'TimeoutError: page.getByText("Submit") — locator not found',
											stack: `TimeoutError: page.getByText("Submit") — locator not found
    at e2e/slow.spec.ts:105:20
    at runMicrotasks (<anonymous>)`
										}
									]
								}
							]
						}
					]
				}
			]
		}
	]
};

describe('compressResults', () => {
	it('returns "All N tests passed." when all pass', () => {
		const result = compressResults(allPassFixture);
		expect(result).toBe('All 2 tests passed.');
	});

	it('includes failure count header when there are failures', () => {
		const result = compressResults(twoFailuresFixture);
		expect(result).toContain('Failures (2/3)');
	});

	it('includes the spec title for each failure', () => {
		const result = compressResults(twoFailuresFixture);
		expect(result).toContain('fails with assertion');
		expect(result).toContain('times out');
	});

	it('includes the suite hierarchy in the test name', () => {
		const result = compressResults(twoFailuresFixture);
		expect(result).toContain('chromium › sub-suite › fails with assertion');
	});

	it('includes file:line for each failure', () => {
		const result = compressResults(twoFailuresFixture);
		expect(result).toContain('e2e/failing.spec.ts:42');
		expect(result).toContain('e2e/slow.spec.ts:99');
	});

	it('includes the error message line for each failure', () => {
		const result = compressResults(twoFailuresFixture);
		expect(result).toContain("expected 'bar' got 'foo'");
		expect(result).toContain('locator not found');
	});

	it('includes the first user-code stack frame, filtering Playwright internals', () => {
		const result = compressResults(twoFailuresFixture);
		expect(result).toContain('e2e/failing.spec.ts:45:18');
		expect(result).not.toContain('playwright/lib/index.js');
	});

	it('includes a stack frame even without project-file matches', () => {
		const noMatchFixture = {
			stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0, ok: false },
			suites: [
				{
					title: 'root',
					specs: [
						{
							title: 'fails without file context',
							file: 'e2e/mystery.spec.ts',
							line: 1,
							column: 1,
							tests: [
								{
									status: 'failed',
									expectedStatus: 'passed',
									errors: [
										{
											message: 'Error: kaboom',
											stack: `Error: kaboom
    at Object.<anonymous> (node_modules/some-lib/helper.js:10:5)
    at runMicrotasks (<anonymous>)`
										}
									]
								}
							]
						}
					]
				}
			]
		};
		const result = compressResults(noMatchFixture);
		expect(result).toContain('node_modules/some-lib/helper.js:10:5');
	});
});

describe('compressResults — edge cases', () => {
	it('handles empty suites array', () => {
		const result = compressResults({
			stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0, ok: true },
			suites: []
		});
		expect(result).toBe('All 0 tests passed.');
	});

	it('handles missing suites field', () => {
		const result = compressResults({
			stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0, ok: true }
		});
		expect(result).toBe('All 0 tests passed.');
	});

	it('handles a spec with no tests array', () => {
		const result = compressResults({
			stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0, ok: true },
			suites: [
				{
					title: 'empty',
					specs: [{ title: 'no tests', file: 'e2e/empty.spec.ts', line: 1, column: 1 }]
				}
			]
		});
		expect(result).toContain('All 0 tests');
	});
});
