/**
 * The ESL teacher profile, from the department users list to the loaded page.
 *
 * Seeds one tagged G7 cohort (CLIL only) for a teacher who currently teaches
 * nothing, so the periods-per-week claim is exact however many suites share the
 * backend. The tag scopes both the seed and its teardown.
 *
 * The local backend persists between runs, so a previous run's cohort key may
 * already exist (tagged or dev residue): in that case the cohort is adopted for
 * the test and restored afterwards rather than failing on the duplicate guard.
 */
import { ConvexHttpClient } from 'convex/browser';
import { test, expect } from './fixtures';
import { api } from '../src/convex/_generated/api';
import { cleanupByTag, useRole } from './convex-client';
import { getTestSuffix } from './helpers';

/** The real current school year, so the live badge evaluates rather than hides. */
const YEAR = '2026-2027';

const e2eTag = `e2e-teacher-profile_${getTestSuffix('esl')}`;

const CONVEX_URL = process.env.CONVEX_URL || 'http://127.0.0.1:3210';

const COHORT_KEY = { year: YEAR, grade: 7, level: 'Advanced', classNumber: '2' };

const SEED_MEETINGS = [
	{ day: 'Monday', period: 8 },
	{ day: 'Wednesday', period: 8 },
	{ day: 'Friday', period: 8 }
] as const;

type Client = ReturnType<typeof authedClient>;

function authedClient() {
	const token = process.env.CONVEX_AUTH_TOKEN;
	return new ConvexHttpClient(CONVEX_URL, token ? { auth: token } : {});
}

type ClassRow = {
	_id: string;
	type: string;
	teacherId?: string | null;
	room?: string | null;
	meetings?: { day: string; period: number }[];
};

type MeetingSlot = {
	day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
	period: number;
};

/** An adopted row's prior assignment, so the test leaves no footprint. */
type AdoptedState = {
	classId: string;
	teacherId: string | null;
	room: string | null;
	meetings: MeetingSlot[];
};

async function clilClassOf(client: Client, cohortId: string): Promise<ClassRow> {
	const classes = (await client.query(api.esl.classes.listByCohort, {
		cohortId: cohortId as never
	})) as ClassRow[];
	const clil = classes.find((c) => c.type === 'CLIL');
	if (!clil) throw new Error('Seeded cohort has no CLIL class');
	return clil;
}

async function meetingsOf(client: Client, classId: string, year: string): Promise<MeetingSlot[]> {
	const rows = (await client.query(api.esl.classes.listScheduleByYear, { year })) as {
		classId: string;
		meetings: MeetingSlot[];
	}[];
	return rows.find((r) => r.classId === classId)?.meetings ?? [];
}

test.describe('ESL teacher profile @esl', () => {
	test.use({ role: 'esladmin' });

	let teacherName = '';
	let teacherId = '';
	let ownedCohortId: string | null = null;
	let adopted: AdoptedState | null = null;

	test.beforeAll(async () => {
		useRole('esladmin');
		const client = authedClient();
		await cleanupByTag('esl', e2eTag);

		const staff = (await client.query(api.esl.staff.list, {})) as {
			_id: string;
			name: string;
			eslRole: string | null;
		}[];
		// A teacher with no classes yet, so the seeded week is the whole load.
		let teacher = null;
		for (const candidate of staff.filter((s) => s.eslRole === 'teacher')) {
			const existing = await client.query(api.esl.classes.listByTeacher, {
				teacherId: candidate._id as never
			});
			if (existing.length === 0) {
				teacher = candidate;
				break;
			}
		}
		teacher ??= staff.find((s) => s.eslRole === 'teacher') ?? staff[0] ?? null;
		if (!teacher) throw new Error('No ESL staff to profile');
		teacherName = teacher.name;
		teacherId = teacher._id;

		let classId: string;
		try {
			const created = (await client.mutation(api.esl.cohorts.create, {
				...COHORT_KEY,
				e2eTag
			})) as { cohortId: string; classIds: string[] };
			ownedCohortId = created.cohortId;
			classId = (await clilClassOf(client, created.cohortId))._id;
		} catch (e) {
			if (!/already exists/.test(String(e))) throw e;
			const cohorts = (await client.query(api.esl.cohorts.list, {
				year: YEAR,
				grade: 7,
				status: 'all'
			})) as { _id: string; level: string; classNumber: string }[];
			const existing = cohorts.find((c) => c.level === 'Advanced' && c.classNumber === '2');
			if (!existing) throw e;
			const clil = await clilClassOf(client, existing._id);
			classId = clil._id;
			adopted = {
				classId,
				teacherId: (clil.teacherId as string | null | undefined) ?? null,
				room: (clil.room as string | null | undefined) ?? null,
				meetings: await meetingsOf(client, classId, YEAR)
			};
		}

		await client.mutation(api.esl.classes.assignTeacher, {
			id: classId as never,
			teacherId: teacher._id as never
		});
		await client.mutation(api.esl.classes.setSchedule, {
			classId: classId as never,
			year: YEAR,
			room: 'ESL A',
			meetings: [...SEED_MEETINGS]
		});
	});

	test.afterAll(async () => {
		useRole('esladmin');
		const client = authedClient();
		if (ownedCohortId) {
			await cleanupByTag('esl', e2eTag);
		} else if (adopted) {
			// Blank clears the room, restoring the unset state when that is
			// what the adoption found; absent would leave the seeded room.
			await client.mutation(api.esl.classes.setSchedule, {
				classId: adopted.classId as never,
				year: YEAR,
				room: adopted.room ?? '',
				meetings: adopted.meetings
			});
			await client.mutation(api.esl.classes.assignTeacher, {
				id: adopted.classId as never,
				...(adopted.teacherId ? { teacherId: adopted.teacherId as never } : {})
			});
		}
	});

	test('clicking a card opens the profile with email and load', async ({ page }) => {
		await page.goto('/esl/admin/users');
		await page.waitForSelector('body.hydrated');

		// Pinned by user id: seeded staff can share a display name.
		await page.locator(`[data-user-id="${teacherId}"]`).click();

		await expect(page).toHaveURL(/\/esl\/admin\/users\/.+/);
		await expect(page.getByRole('heading', { name: teacherName })).toBeVisible();

		// Pin the seeded year so the claims hold whatever else shares the backend.
		await page.getByTestId('esl-admin-user-profile.year').selectOption(YEAR);

		await expect(page.getByTestId('esl-admin-user-profile.email')).toBeVisible();
		await expect(page.getByTestId('esl-admin-user-profile.periods')).toContainText(
			'3 periods/week'
		);
		await expect(page.getByText('G7 Advanced 2 CLIL')).toBeVisible();
		await expect(page.getByTestId('esl-admin-user-profile.now')).toBeVisible();
	});
});
