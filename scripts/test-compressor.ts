type TestError = { message: string; stack?: string };

type JsonReport = {
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
	tests?: TestResult[];
};

type TestResult = {
	status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
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
		if (test.status === 'failed' || test.status === 'timedOut' || test.status === 'interrupted') {
			if (test.errors) {
				errors.push(...test.errors);
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

function firstLine(message: string): string {
	return message.split('\n')[0] ?? message;
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

	for (const spec of failedSpecs) {
		lines.push(`### ${spec.title}`);
		lines.push(`\`${spec.file}:${spec.line}\``);
		for (const err of spec.errors) {
			lines.push(`- ${firstLine(err.message)}`);
			if (err.stack) {
				const frame = firstRelevantStackFrame(err.stack);
				if (frame) {
					lines.push(`  \`${frame}\``);
				}
			}
		}
		lines.push('');
	}

	return lines.join('\n').trimEnd();
}
