type TestError = { message: string; stack?: string };

export type JsonReport = {
	stats?: { expected: number; unexpected: number; flaky: number; skipped: number; ok: boolean };
	suites?: Suite[];
};

type Suite = {
	title: string;
	file?: string;
	specs?: Spec[];
	suites?: Suite[];
};

type Spec = {
	title: string;
	file: string;
	line: number;
	column?: number;
	tests?: TestResult[];
};

type TestResult = {
	status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted' | 'expected';
	expectedStatus?: 'passed' | 'failed';
	errors?: TestError[];
};

type FlatSpec = {
	title: string;
	file: string;
	line: number;
	errors: TestError[];
};

function collectErrors(tests: TestResult[]): TestError[] {
	const errors: TestError[] = [];
	for (const test of tests) {
		if (
			test.status === 'failed' ||
			test.status === 'timedOut' ||
			test.status === 'interrupted' ||
			test.status === 'unexpected'
		) {
			if (test.errors && test.errors.length > 0) {
				errors.push(...test.errors);
			} else {
				errors.push({
					message: `Test ${test.status} (expected ${test.expectedStatus ?? 'unknown'}) with no error details`
				});
			}
		}
	}
	return errors;
}

function collectFailedSpecs(suites: Suite[], parentTitles: string[] = []): FlatSpec[] {
	const specs: FlatSpec[] = [];
	for (const suite of suites) {
		const titles = [...parentTitles, suite.title];
		if (suite.specs) {
			for (const spec of suite.specs) {
				const errors = spec.tests ? collectErrors(spec.tests) : [];
				if (errors.length > 0) {
					specs.push({
						title: [...titles, spec.title].join(' › '),
						file: spec.file,
						line: spec.line,
						errors
					});
				}
			}
		}
		if (suite.suites) {
			specs.push(...collectFailedSpecs(suite.suites, titles));
		}
	}
	return specs;
}

function firstRelevantStackFrame(stack: string): string {
	const lines = stack.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('at ')) continue;
		if (trimmed.includes('node_modules')) continue;
		if (trimmed.includes('<anonymous>') && !trimmed.match(/\.(spec|test)\.(ts|js)/)) continue;
		return trimmed;
	}
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith('at ')) return trimmed;
	}
	return lines[0] ?? '';
}

type ErrorDetails = {
	summary: string;
	locator?: string;
	timeout?: string;
	expected?: string;
	received?: string;
};

function parseErrorDetails(message: string): ErrorDetails {
	const lines = message
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
	const summary = lines[0] ?? message;

	let locator: string | undefined;
	let timeout: string | undefined;
	let expected: string | undefined;
	let received: string | undefined;

	for (const line of lines) {
		const locatorMatch = line.match(/^Locator:\s+(.+)$/i);
		if (locatorMatch) {
			locator = locatorMatch[1];
			continue;
		}
		const timeoutMatch = line.match(/^Timeout:\s+(.+)$/i);
		if (timeoutMatch) {
			timeout = timeoutMatch[1];
			continue;
		}
		const expectedMatch = line.match(/^Expected:\s+(.+)$/i);
		if (expectedMatch) {
			expected = expectedMatch[1];
			continue;
		}
		const receivedMatch = line.match(/^Received:\s+(.+)$/i);
		if (receivedMatch) {
			received = receivedMatch[1];
			continue;
		}
	}

	// Fallback: try to extract expected/received from inline format like
	// "expect(received).toBe(expected) — expected 'bar' got 'foo'"
	if (!expected && !received) {
		const inlineMatch = summary.match(/expected\s+['"](.+?)['"]\s+got\s+['"](.+?)['"]/);
		if (inlineMatch) {
			expected = inlineMatch[1];
			received = inlineMatch[2];
		}
	}

	return { summary, locator, timeout, expected, received };
}

function formatErrorLines(details: ErrorDetails): string[] {
	const lines: string[] = [];
	lines.push(`- ${details.summary}`);
	if (details.locator) {
		lines.push(`  Locator: \`${details.locator}\``);
	}
	if (details.timeout) {
		lines.push(`  Timeout: ${details.timeout}`);
	}
	if (details.expected !== undefined && details.received !== undefined) {
		lines.push(`  Expected: \`${details.expected}\``);
		lines.push(`  Received: \`${details.received}\``);
	}
	return lines;
}

export function compressResults(report: JsonReport): string {
	const suites = report.suites ?? [];
	const s = report.stats;
	const total = (s?.expected ?? 0) + (s?.unexpected ?? 0) + (s?.flaky ?? 0) + (s?.skipped ?? 0);
	const failed = s?.unexpected ?? 0;

	if (failed === 0) {
		return `All ${total} tests passed.`;
	}

	const failedSpecs = collectFailedSpecs(suites);

	const lines: string[] = [];
	lines.push(`## Failures (${failed}/${total})`);
	lines.push('');

	if (failedSpecs.length === 0) {
		lines.push('*No spec-level details available — the failure may be in a hook or setup.*');
	}

	for (const spec of failedSpecs) {
		lines.push(`### ${spec.title}`);
		lines.push(`\`${spec.file}:${spec.line}\``);
		for (const err of spec.errors) {
			const details = parseErrorDetails(err.message);
			lines.push(...formatErrorLines(details));
			if (err.stack) {
				const frame = firstRelevantStackFrame(err.stack);
				if (frame) {
					lines.push(`  at \`${frame}\``);
				}
			}
		}
		lines.push('');
	}

	return lines.join('\n').trimEnd();
}
