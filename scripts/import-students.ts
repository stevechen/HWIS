import { readFileSync } from 'fs';
import { parse } from 'dotenv';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../src/convex/_generated/api.js';

// Manually load .env.local
const envLocal = readFileSync('.env.local', 'utf-8');
const env = parse(envLocal);

const csv = readFileSync('static/HWIS student list.csv', 'utf-8');
const lines = csv.trim().split('\n');

type StudentInput = {
	englishName: string;
	chineseName: string;
	studentId: string;
	grade: number;
	class?: string;
	status: 'Enrolled' | 'Not Enrolled';
	note?: string;
	house?: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna';
};

const students: StudentInput[] = [];
const HOUSES = ['Heracles', 'Wukong', 'Ixbalam', 'Setna'] as const;

for (let i = 1; i < lines.length; i++) {
	const cols = lines[i].split(',');
	const gradeRaw = cols[0]?.trim();
	const studentId = cols[1]?.trim();
	const chineseName = cols[2]?.trim();
	const englishName = cols[3]?.trim();
	const houseRaw = cols[4]?.trim();
	const note = cols[5]?.trim();

	if (!studentId || !englishName) continue;

	let grade: number;
	let className: string | undefined;

	if (gradeRaw.includes('-')) {
		const parts = gradeRaw.split('-');
		grade = parseInt(parts[0], 10);
		className = parts[1];
	} else {
		grade = parseInt(gradeRaw, 10);
		className = '1';
	}

	if (grade < 7 || grade > 12 || isNaN(grade)) {
		console.warn(`Skipping row ${i + 1}: invalid grade "${gradeRaw}"`);
		continue;
	}

	const house = HOUSES.includes(houseRaw as typeof HOUSES[number])
		? (houseRaw as 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna')
		: undefined;

	students.push({
		englishName,
		chineseName: chineseName || '',
		studentId,
		grade,
		class: className,
		status: 'Enrolled',
		note: note || '',
		house
	});
}

console.log(`Parsed ${students.length} students from CSV`);

const convexUrl = env.PUBLIC_CONVEX_URL || 'http://127.0.0.1:3210';
const convex = new ConvexHttpClient(convexUrl);

const BATCH_SIZE = 50;
let totalCreated = 0;
let totalUpdated = 0;

for (let i = 0; i < students.length; i += BATCH_SIZE) {
	const batch = students.slice(i, i + BATCH_SIZE);
	console.log(`Importing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(students.length / BATCH_SIZE)}...`);
	const results = await convex.mutation(api.students.importFromExcel, {
		students: batch,
		testToken: 'unit-test-token'
	});
	for (const r of results) {
		if (r.success) {
			if (r.action === 'created') totalCreated++;
			else totalUpdated++;
		} else {
			console.error(`  Failed: ${r.studentId} - ${r.error}`);
		}
	}
}

console.log(`Done! Created: ${totalCreated}, Updated: ${totalUpdated}, Total: ${students.length}`);
