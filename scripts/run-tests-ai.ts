import { spawn } from 'child_process';
import { compressResults } from './test-compressor';

type JsonReport = {
	stats?: { expected: number; unexpected: number; flaky: number; skipped: number; ok: boolean };
};

function isJsonReport(value: unknown): value is JsonReport {
	return typeof value === 'object' && value !== null && 'stats' in (value as object);
}

/**
 * Bun can inject Convex's local development token into the environment. Its
 * `dev:<project>|<base64>` format is not a JWT and causes Convex authorization
 * requests to fail when forwarded to the local server.
 */
function sanitizeEnv() {
	const token = process.env.CONVEX_AUTH_TOKEN;
	if (token && token.split('.').length !== 3) {
		delete process.env.CONVEX_AUTH_TOKEN;
	}
}

async function main() {
	sanitizeEnv();
	const passthroughArgs = process.argv.slice(2);

	// Delegate to scripts/run-e2e.sh, which boots Convex + Vite and runs the
	// suite via playwright.e2e.config.ts (no webServer reuse pitfall). The wrapper
	// logs to stderr, so Playwright's JSON report stays on stdout.
	const child = spawn('bash', ['scripts/run-e2e.sh', '--reporter=json', ...passthroughArgs], {
		stdio: ['inherit', 'pipe', 'inherit'],
		shell: false
	});

	const chunks: Buffer[] = [];
	child.stdout.on('data', (chunk: Buffer) => {
		chunks.push(chunk);
	});

	const exitCode = await new Promise<number>((resolve) => {
		child.on('close', resolve);
		child.on('error', (err) => {
			console.error('Failed to spawn Playwright:', err.message);
			process.exit(1);
		});
	});

	const raw = Buffer.concat(chunks).toString('utf-8').trim();
	if (!raw) {
		console.error('No output from Playwright.');
		process.exit(exitCode || 1);
	}

	let report: unknown;
	try {
		report = JSON.parse(raw);
	} catch {
		console.error('Failed to parse Playwright JSON output.');
		console.error(raw.slice(0, 500));
		process.exit(exitCode || 1);
	}

	if (!isJsonReport(report)) {
		console.error('Invalid Playwright JSON report format.');
		process.exit(exitCode || 1);
	}

	const compressed = compressResults(report);
	console.log(compressed);

	const hasFailures = (report.stats?.unexpected ?? 0) > 0;
	process.exit(hasFailures ? 1 : 0);
}

main();
