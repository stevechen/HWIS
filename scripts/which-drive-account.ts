#!/usr/bin/env bun
/**
 * Report which Google account the prod refresh token is actually bound to.
 *
 * Reads the token from the prod Convex env and prints only the email — never the
 * token itself. Safe to paste the output of this into a chat or an issue.
 *
 * Use this when `check-drive-folder.ts` reports the folder unreachable: it
 * separates "the token belongs to the wrong account" from "the folder is not in
 * the account the token owns", which need opposite fixes.
 */

import { execFileSync } from 'node:child_process';

function prodEnv(): Record<string, string> {
	const out = execFileSync('bunx', ['convex', 'env', 'list', '--prod'], { encoding: 'utf8' });
	const env: Record<string, string> = {};
	for (const line of out.split('\n')) {
		const at = line.indexOf('=');
		if (at > 0) env[line.slice(0, at)] = line.slice(at + 1).replace(/^['"]|['"]$/g, '');
	}
	return env;
}

const env = prodEnv();

const tok = (await (
	await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: '440526535452-5c1tt37fqqhu9q8gbdekbcn38blrbea8.apps.googleusercontent.com',
			client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
			refresh_token: env.GOOGLE_REFRESH_TOKEN ?? '',
			grant_type: 'refresh_token'
		})
	})
).json()) as { access_token?: string; error_description?: string; error?: string };

if (!tok.access_token) {
	console.log(`token exchange failed: ${tok.error ?? ''} ${tok.error_description ?? ''}`);
	process.exit(1);
}

const about = await fetch(
	'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress),storageQuota',
	{ headers: { Authorization: `Bearer ${tok.access_token}` } }
);
const data = (await about.json()) as {
	user?: { displayName?: string; emailAddress?: string };
	error?: { message?: string };
};

if (about.status !== 200 || !data.user) {
	console.log(`about failed (HTTP ${about.status}): ${data.error?.message ?? 'unknown'}`);
	process.exit(1);
}

console.log(`token account : ${data.user.emailAddress ?? '(no email — service account?)'}`);
console.log(`display name  : ${data.user.displayName ?? '-'}`);
console.log(`\nExpected: steve@hwhs.tc.edu.tw`);
console.log(`Folder target: ${env.GOOGLE_DRIVE_FOLDER_ID ?? '(unset)'}`);
