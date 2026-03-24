import { getE2EUtils, type CreateStudentOptions, refreshClient } from '../src/lib/e2e-utils';
import fs from 'fs';
import path from 'path';

// Singleton instance to ensure consistent auth token handling
let e2eUtils: ReturnType<typeof getE2EUtils> | null = null;

// Track if we've been initialized with auth
let authInitialized = false;

export function setAuthToken(token: string) {
	process.env.CONVEX_AUTH_TOKEN = token;
	e2eUtils = null; // Reset singleton to pick up new token
	refreshClient(); // Also refresh the Convex client
	authInitialized = true;
}

export function clearAuth() {
	process.env.CONVEX_AUTH_TOKEN = undefined;
	e2eUtils = null;
	authInitialized = false;
}

export function isAuthInitialized(): boolean {
	return authInitialized;
}

export function useRole(role: 'admin' | 'teacher' | 'super') {
	const authPath = path.join(process.cwd(), 'e2e', '.auth', `${role}.json`);
	if (fs.existsSync(authPath)) {
		try {
			interface Cookie {
				name: string;
				value: string;
				[key: string]: unknown;
			}

			const state: { cookies: Cookie[] } = JSON.parse(fs.readFileSync(authPath, 'utf8'));
			const convexCookie = state.cookies?.find((c: Cookie) => c.name === 'better-auth.convex_jwt');
			if (convexCookie?.value) {
				// Set token in environment variable (for Node.js context)
				setAuthToken(convexCookie.value);

				// Also set in localStorage (for browser context)
				if (typeof localStorage !== 'undefined') {
					localStorage.setItem('convexAuth', JSON.stringify({ token: convexCookie.value }));
				}
				return true;
			}
		} catch (e) {
			console.error(`Failed to load storage state from ${authPath}:`, e);
		}
	}
	return false;
}

function getUtils(): ReturnType<typeof getE2EUtils> {
	if (!e2eUtils) {
		e2eUtils = getE2EUtils();
	}
	return e2eUtils;
}

export async function seedBaseline() {
	const utils = getUtils();
	return await utils.seedBaseline();
}

export async function cleanupAll() {
	const utils = getUtils();
	return await utils.cleanupAll();
}

export async function cleanupTestData(tag: string) {
	const utils = getUtils();
	return await utils.cleanupByTag('all', tag);
}

export async function cleanupAllE2eTaggedData() {
	const utils = getUtils();
	return await utils.cleanupAllE2eTaggedData();
}

export async function cleanupAuditLogs(authIdString?: string) {
	const utils = getUtils();
	return await utils.cleanupAuditLogs(authIdString);
}

export async function cleanupByTag(
	dataType: 'students' | 'categories' | 'evaluations' | 'all',
	e2eTag: string,
	maxRetries = 3
) {
	const utils = getUtils();

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await utils.cleanupByTag(dataType, e2eTag);
		} catch (error) {
			if (attempt === maxRetries) {
				console.warn(`Cleanup failed after ${maxRetries} attempts:`, error);
				return; // Don't fail the test for cleanup errors
			}
			// Wait before retry (exponential backoff)
			await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
		}
	}
}

export async function cleanupTestUsers() {
	const utils = getUtils();
	return await utils.cleanupTestUsers();
}

export async function setupTestUsers() {
	const utils = getUtils();
	return await utils.setupTestUsers();
}

export async function resetAll() {
	const utils = getUtils();
	return await utils.resetAll();
}

export async function seedCategoriesForDelete() {
	const utils = getUtils();
	return await utils.seedCategoriesForDelete();
}

export async function seedStudentsForDisable() {
	const utils = getUtils();
	return await utils.seedStudentsForDisable();
}

export async function seedAuditLogs(authId?: string) {
	const utils = getUtils();
	return await utils.seedAuditLogs(authId);
}

export async function createStudent(opts: CreateStudentOptions) {
	const utils = getUtils();
	return await utils.createStudentWithId(opts);
}

export async function createClass(opts: { grade: number; class: string; e2eTag?: string }) {
	const utils = getUtils();
	return await utils.createClass(opts);
}

export async function setE2eTag(
	dataType: 'students' | 'categories' | 'evaluations',
	dataId: string,
	e2eTag: string
) {
	const utils = getUtils();
	return await utils.setE2eTag(dataType, dataId, e2eTag);
}

export async function createCategory(opts: { name?: string; e2eTag?: string }) {
	const utils = getUtils();
	return await utils.createCategory(opts);
}

export async function createEvalForCategory(categoryName: string) {
	const utils = getUtils();
	return await utils.createEvalForCategory(categoryName);
}

export async function checkEvaluationExists(categoryName: string) {
	const utils = getUtils();
	return await utils.checkEvaluationExists(categoryName);
}

const categorySeedByTag = new Map<string, Promise<void>>();

async function ensureCategoryForTag(e2eTag: string) {
	if (!e2eTag) return;
	const existing = categorySeedByTag.get(e2eTag);
	if (existing) {
		await existing;
		return;
	}

	const creation = createCategory({
		name: `Cat_${e2eTag}`,
		e2eTag
	})
		.then(() => undefined)
		.catch((error: Error) => {
			categorySeedByTag.delete(e2eTag);
			throw error;
		});

	categorySeedByTag.set(e2eTag, creation);
	await creation;
}

// Internal helper - not exported, use createStudentWithEvaluations instead
async function createEvaluationForStudent(data: { studentId: string; e2eTag?: string }) {
	const utils = getUtils();
	return await utils.createEvaluationForStudent(data);
}

/**
 * Create a student with multiple evaluations in parallel.
 * This is more efficient than creating them separately.
 * @param opts.studentId - The student ID
 * @param opts.englishName - The English name for the student
 * @param opts.chineseName - The Chinese name for the student
 * @param opts.grade - The grade level
 * @param opts.status - The enrollment status
 * @param opts.evaluationCount - Number of evaluations to create (default: 1)
 * @param opts.e2eTag - The e2e tag for cleanup
 * @returns The student document ID
 */
export async function createStudentWithEvaluations(opts: {
	studentId: string;
	englishName: string;
	chineseName: string;
	grade: number;
	status: string;
	evaluationCount?: number;
	e2eTag: string;
}) {
	const { evaluationCount = 1, ...studentOpts } = opts;

	// Create student first and get the doc ID
	const studentDocId = await createStudent({
		studentId: studentOpts.studentId,
		englishName: studentOpts.englishName,
		chineseName: studentOpts.chineseName,
		grade: studentOpts.grade,
		status: studentOpts.status,
		e2eTag: studentOpts.e2eTag
	});

	// Create ONE category for this test BEFORE creating evaluations in parallel
	// This prevents OptimisticConcurrencyControlFailure when multiple evaluations
	// try to create the same category simultaneously
	await ensureCategoryForTag(opts.e2eTag);

	// Now create all evaluations in parallel (they'll find the existing category)
	await Promise.all(
		Array(evaluationCount)
			.fill(null)
			.map(() => createEvaluationForStudent({ studentId: opts.studentId, e2eTag: opts.e2eTag }))
	);

	return studentDocId;
}

export async function setRoleByEmail(email: string, role: string) {
	const utils = getUtils();
	return await utils.setRoleByEmail(email, role);
}

export async function setMyRole(role: string) {
	const utils = getUtils();
	return await utils.setMyRole(role);
}

export async function setRoleByToken(token: string, role: string) {
	const utils = getUtils();
	return await utils.setRoleByToken(token, role);
}

export async function createWeeklyReportTestData(tag?: string) {
	const utils = getUtils();
	return await utils.createWeeklyReportTestData(tag);
}

export async function cleanupWeeklyReportTestData(tag?: string) {
	const utils = getUtils();
	return await utils.cleanupWeeklyReportTestData(tag);
}

export function getE2EUtilsClient() {
	return getUtils();
}
