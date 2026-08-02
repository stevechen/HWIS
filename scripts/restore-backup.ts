import { readFileSync } from 'fs';
import { parse } from 'dotenv';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../src/convex/_generated/api.js';

const envLocal = readFileSync('.env.local', 'utf-8');
const env = parse(envLocal);

const backupPath = process.argv[2];
if (!backupPath) {
	console.error('Usage: bun scripts/restore-backup.ts <path-to-backup.json>');
	process.exit(1);
}

const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));

console.log('Backup file contents:');
console.log(`  Exported at: ${backupData.exportedAt}`);
console.log(`  Version: ${backupData.version}`);
console.log(`  Categories: ${backupData.categories?.length ?? 0}`);
console.log(`  Classes: ${backupData.classes?.length ?? 0}`);
console.log(`  Students: ${backupData.students?.length ?? 0}`);
console.log(`  Evaluations: ${backupData.evaluations?.length ?? 0}`);
console.log(`  Users: ${backupData.users?.length ?? 0}`);
console.log(`  House Events: ${backupData.houseEvents?.length ?? 0}`);

const convexUrl = env.PUBLIC_CONVEX_URL || 'http://127.0.0.1:3210';
const convex = new ConvexHttpClient(convexUrl);

console.log('\nRestoring data...');

try {
	const result = await convex.mutation(api.backup.restoreFromBackupPayload, {
		backupData: backupData
	});
	console.log(`\nSuccess: ${result.message}`);
} catch (error) {
	console.error('\nError restoring backup:', error);
	process.exit(1);
}
