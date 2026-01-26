import { getE2EUtils, type CreateStudentOptions } from '../src/lib/e2e-utils';

let e2eUtils: ReturnType<typeof getE2EUtils> | null = null;

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
	return await utils.cleanupTestData(tag);
}

export async function cleanupAuditLogs() {
	const utils = getUtils();
	return await utils.cleanupAuditLogs();
}

export async function cleanupTestUsers() {
	const utils = getUtils();
	return await utils.cleanupTestUsers();
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

export async function createCategory(opts: {
	name?: string;
	subCategories?: string[];
	e2eTag?: string;
}) {
	const utils = getUtils();
	return await utils.createCategory(opts);
}

export async function createCategoryWithSubs(opts: {
	name: string;
	subCategories: string[];
	e2eTag?: string;
}) {
	const utils = getUtils();
	return await utils.createCategoryWithSubs(opts);
}

export async function createEvalForCategory(categoryName: string) {
	const utils = getUtils();
	return await utils.createEvalForCategory(categoryName);
}

export async function createEvaluationForStudent(data: { studentId: string; e2eTag?: string }) {
	const utils = getUtils();
	return await utils.createEvaluationForStudent(data);
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

export async function checkEvaluationExists(categoryName: string) {
	const utils = getUtils();
	return await utils.checkEvaluationExists(categoryName);
}

export async function createWeeklyReportTestData() {
	const utils = getUtils();
	const client = (utils as any).client;
	if (!client) {
		throw new Error('E2E client not available');
	}
	return await client.mutation('testData/weeklyReports:createWeeklyReportTestData', {});
}

export async function cleanupWeeklyReportTestData() {
	const utils = getUtils();
	const client = (utils as any).client;
	if (!client) {
		throw new Error('E2E client not available');
	}
	return await client.mutation('testData/weeklyReports:cleanupWeeklyReportTestData', {});
}

export function getE2EUtilsClient() {
	return getUtils();
}
