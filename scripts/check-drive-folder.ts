#!/usr/bin/env bun
/**
 * Read-only probe of the Drive backup folder: owner, ID, and who can write.
 *
 * Run before and after an ownership transfer, because two things change and
 * neither is obvious:
 *
 *  1. Transferring ownership can change the folder's ID. `GOOGLE_DRIVE_FOLDER_ID`
 *     is set in the prod Convex env, so a silent ID change makes the nightly
 *     backup write nothing while still reporting success in the database.
 *  2. Transferring ownership revokes the transferring account's write access.
 *     The refresh token in prod belongs to that account, so the next 20:00 UTC
 *     run fails with 404 or 403.
 *
 * Prints no secrets; reads credentials from the prod Convex env.
 */

import { execFileSync } from 'node:child_process';

const CLIENT_ID = '440526535452-5c1tt37fqqhu9q8gbdekbcn38blrbea8.apps.googleusercontent.com';

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
const folderId = env.GOOGLE_DRIVE_FOLDER_ID;
if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set on prod');

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
	method: 'POST',
	headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	body: new URLSearchParams({
		client_id: CLIENT_ID,
		client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
		refresh_token: env.GOOGLE_REFRESH_TOKEN ?? '',
		grant_type: 'refresh_token'
	})
});
const tok = (await tokenRes.json()) as { access_token?: string; error_description?: string };
if (!tok.access_token) throw new Error(`token: ${tok.error_description ?? 'failed'}`);
const auth = { Authorization: `Bearer ${tok.access_token}` };

const meta = await fetch(
	`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,owners,createdTime,driveId`,
	{ headers: auth }
);
console.log(`folder metadata HTTP ${meta.status}`);
console.log(JSON.stringify(await meta.json(), null, 2));

const perms = await fetch(
	`https://www.googleapis.com/drive/v3/files/${folderId}/permissions?fields=permissions(id,type,role,emailAddress,domain)&pageSize=100`,
	{ headers: auth }
);
console.log(`\npermissions HTTP ${perms.status}`);
const p = (await perms.json()) as {
	permissions?: Array<{ type?: string; role?: string; emailAddress?: string; domain?: string }>;
};
for (const perm of p.permissions ?? []) {
	console.log(
		`  ${String(perm.type).padEnd(10)} ${String(perm.role).padEnd(12)} ${perm.emailAddress ?? perm.domain ?? ''}`
	);
}

// `drive.file` grants access only to files the app itself created, so metadata
// and ACLs on a hand-made folder read as 404. That is expected and says nothing
// about write access — listing the children below is what actually proves it.
const files = await fetch(
	`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents`)}&fields=files(name,size)&pageSize=1000`,
	{ headers: auth }
);
const f = (await files.json()) as { files?: Array<{ name: string; size: string }> };
const list = f.files ?? [];

console.log(`\nGOOGLE_DRIVE_FOLDER_ID in prod env: ${folderId}`);
console.log(`token exchanged successfully: yes`);

// Deliberately not collapsing this into a single yes/no. The children query
// returns an empty list both when the token cannot see the folder at all and
// when the folder is simply empty, so an earlier version of this script printed
// "reachable: no" for a perfectly healthy empty folder — and that was misread as
// an access failure during the 2026-10-03 folder migration. The empty case is
// the expected one right after a migration: `drive.file` only sees files the app
// created, so files copied in by hand do not appear here.
//
// A non-empty list is the only affirmative proof the token has write access to
// this folder. Until one app-created file exists, run a backup and look for the
// file in Drive.
if (list.length > 0) {
	const byName = [...list].sort((a, b) => a.name.localeCompare(b.name));
	const total = list.reduce((n, x) => n + Number(x.size), 0);
	console.log(`files written by this app: ${list.length}, ${(total / 1024 / 1024).toFixed(2)} MB`);
	console.log(`  oldest: ${byName[0].name}`);
	console.log(`  newest: ${byName[byName.length - 1].name}`);
} else {
	console.log('files written by this app: 0 (expected until the first backup runs)');
}
