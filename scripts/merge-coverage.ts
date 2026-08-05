import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import type { FileCoverageData } from 'istanbul-lib-coverage';

const repoRoot = path.resolve(import.meta.dirname, '..');

const sources = {
	component: path.join(repoRoot, 'coverage/component/coverage-final.json'),
	convex: path.join(repoRoot, 'coverage/convex/coverage-final.json'),
	e2e: path.join(repoRoot, 'coverage/e2e/raw')
};

const outDir = path.join(repoRoot, 'coverage');

const scopeIncludes = (rel: string) => rel.startsWith('src/lib/') || rel.startsWith('src/convex/');

// Test tooling, one-off scripts, bootstrap wiring, and barrel re-exports that
// are not part of the program itself. Add files here to drop them from the
// merged report.
const testOnlyExcludes = [
	'src/lib/e2e-utils.ts',
	'src/lib/server/convex-url.ts',
	'src/convex/dataFactory.ts',
	'src/convex/test.setup.ts',
	'src/convex/testAuth.ts',
	'src/convex/testCleanup.ts',
	'src/convex/testE2E.ts',
	'src/convex/testSetup.ts',
	'src/convex/testData/',
	'src/convex/clearJwks.ts',
	'src/convex/dedupeUsers.ts',
	'src/convex/dedupeLocalUsers.ts',
	'src/convex/listUsers.ts',
	'src/convex/recoverAuth.ts',
	'src/convex/resetDb.ts',
	'src/convex/seedAdmin.ts',
	'src/convex/auth.local.ts',
	'src/convex/convex.config.ts',
	'src/convex/http.ts',
	'src/convex/auth.config.ts',
	'src/lib/components/timeline/index.ts',
	'src/lib/evaluations/index.ts',
	'src/lib/evaluations/components/index.ts'
];

const scopeExcludes = (rel: string) =>
	rel.startsWith('src/lib/components/ui/') ||
	rel.startsWith('src/convex/_generated/') ||
	rel.includes('node_modules') ||
	rel.includes('.svelte-kit') ||
	/\.(test|spec)\./.test(rel) ||
	testOnlyExcludes.some((pattern) => rel === pattern || rel.startsWith(pattern));

function normalizeKey(key: string): string | null {
	let rel = key.replace(/^file:\/\//, '').replace(/\\/g, '/');
	rel = rel.split(/[?#]/)[0];

	if (rel.startsWith(`${repoRoot}/`)) {
		rel = rel.slice(repoRoot.length + 1);
	} else if (rel.startsWith('/src/')) {
		rel = rel.slice(1);
	} else if (rel.startsWith('./')) {
		rel = rel.slice(2);
	}

	if (!scopeIncludes(rel) || scopeExcludes(rel)) return null;
	if (!existsSync(path.join(repoRoot, rel))) return null;
	return rel;
}

function loadRawCoverageFiles(dir: string): Record<string, FileCoverageData> {
	if (!existsSync(dir)) return {};
	return readdirSync(dir)
		.filter((file) => file.endsWith('.json'))
		.reduce<Record<string, FileCoverageData>>((acc, file) => {
			const raw = JSON.parse(readFileSync(path.join(dir, file), 'utf-8')) as Record<
				string,
				FileCoverageData
			>;
			for (const [key, data] of Object.entries(raw)) {
				acc[key] = data;
			}
			return acc;
		}, {});
}

function collectInto(map: ReturnType<typeof libCoverage.createCoverageMap>) {
	for (const [name, file] of Object.entries(sources)) {
		let data: Record<string, FileCoverageData>;
		if (file.endsWith('.json')) {
			if (!existsSync(file)) {
				console.warn(`[coverage] missing source "${name}": ${file}`);
				continue;
			}
			data = JSON.parse(readFileSync(file, 'utf-8'));
		} else {
			data = loadRawCoverageFiles(file);
			if (Object.keys(data).length === 0) {
				console.warn(`[coverage] missing source "${name}": no raw files in ${file}`);
			}
		}

		const normalized: Record<string, FileCoverageData> = {};
		for (const [key, fileCoverage] of Object.entries(data)) {
			const rel = normalizeKey(key);
			if (!rel) continue;
			normalized[rel] = { ...fileCoverage, path: rel };
		}
		map.merge(normalized);
	}
}

function main() {
	const map = libCoverage.createCoverageMap();
	collectInto(map);

	const files = Object.keys(map.toJSON());
	if (files.length === 0) {
		console.error('[coverage] nothing to report; run the coverage suites first.');
		process.exit(1);
	}

	mkdirSync(outDir, { recursive: true });
	writeFileSync(
		path.join(outDir, 'coverage-final.json'),
		JSON.stringify(map.toJSON(), null, 2),
		'utf-8'
	);

	const context = libReport.createContext({
		dir: outDir,
		coverageMap: map,
		sourceFinder: (filePath: string) => readFileSync(filePath, 'utf-8')
	});

	reports.create('html', { subdir: '.' }).execute(context);
	reports.create('text').execute(context);

	const summary = map.getCoverageSummary();
	const pct = (n: number) => `${n.toFixed(1)}%`;
	console.log(
		`[coverage] merged ${files.length} files | ` +
			`lines ${pct(summary.lines.pct)} | statements ${pct(summary.statements.pct)} | ` +
			`functions ${pct(summary.functions.pct)} | branches ${pct(summary.branches.pct)}`
	);
}

main();
