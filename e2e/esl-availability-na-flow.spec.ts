/**
 * Profile availability NA block → class-timetable picker → gate refusal.
 *
 * Seeds two tagged G7 cohorts (CLIL classes only take part; the Comm siblings
 * stay unscheduled): C1 taught by a teacher with no other classes, C2 meeting
 * at Monday P1 with no teacher yet. The tag scopes both the seed and its
 * teardown; a previous run's cohort key may already exist (tagged or dev
 * residue), in which case the cohort is adopted for the test and restored
 * afterwards rather than failing on the duplicate guard.
 *
 * The flow itself is browser-driven throughout: block Monday P1 with a note via
 * the profile's Set availability dialog, see the slot read NA in C1's schedule
 * picker, draft the conflicting slot and see the gate refuse it, then assign
 * the teacher to C2 and see the server refusal quote the note.
 */
import { ConvexHttpClient } from 'convex/browser';
import { test, expect } from './fixtures';
import { api } from '../src/convex/_generated/api';
import { cleanupByTag, useRole } from './convex-client';
import { getTestSuffix } from './helpers';

/** The real current school year, so the profile picker offers it. */
const YEAR = '2026-2027';

const e2eTag = `e2e-availability-na-flow_${getTestSuffix('esl')}`;

/** Quoted back by the gate, so it ties the block to both refusals. */
const BLOCK_NOTE = `HWIS homeroom ${e2eTag}`;

const CONVEX_URL = process.env.CONVEX_URL || 'http://127.0.0.1:3210';

const COHORT_A = { year: YEAR, grade: 7, level: 'Pre-Elementary', classNumber: '1' };
const COHORT_B = { year: YEAR, grade: 7, level: 'Pre-Elementary', classNumber: '2' };

/** C1's week: Monday is taught (so the picker moves it), never at P1. */
const C1_MEETINGS = [
	{ day: 'Monday', period: 2 },
	{ day: 'Wednesday', period: 3 },
	{ day: 'Friday', period: 4 }
] as const;

/** C2's week: Monday P1 is the slot the block will forbid. */
const C2_MEETINGS = [
	{ day: 'Monday', period: 1 },
	{ day: 'Tuesday', period: 5 },
	{ day: 'Wednesday', period: 6 }
] as const;

type Client = ReturnType<typeof authedClient>;

function authedClient() {
	const token = process.env.CONVEX_AUTH_TOKEN;
	return new ConvexHttpClient(CONVEX_URL, token ? { auth: token } : {});
}

type MeetingSlot = {
	day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
	period: number;
};

type ClassRow = {
	_id: string;
	type: string;
	teacherId?: string | null;
	room?: string | null;
};

/** An adopted class's prior assignment, so the test leaves no footprint. */
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

async function blocksOf(client: Client, teacherId: string, year: string) {
	const rows = (await client.query(api.esl.availability.listByYear, { year })) as {
		teacherId: string;
		day: MeetingSlot['day'];
		period: number;
		note?: string;
	}[];
	return rows
		.filter((row) => row.teacherId === teacherId)
		.map((row) => ({ day: row.day, period: row.period, ...(row.note ? { note: row.note } : {}) }));
}

test.describe('ESL availability NA flow @esl', () => {
	test.use({ role: 'esladmin' });

	let teacherName = '';
	let teacherId = '';
	let classAId = '';
	let classBId = '';
	let ownedCohorts = 0;
	const adopted: AdoptedState[] = [];
	let adoptedBlocks: { day: MeetingSlot['day']; period: number; note?: string }[] = [];

	test.beforeAll(async () => {
		useRole('esladmin');
		const client = authedClient();
		await cleanupByTag('esl', e2eTag);

		const ensureCohort = async (key: typeof COHORT_A): Promise<string> => {
			try {
				const created = (await client.mutation(api.esl.cohorts.create, {
					...key,
					e2eTag
				})) as { cohortId: string; classIds: string[] };
				ownedCohorts += 1;
				return created.cohortId;
			} catch (e) {
				if (!/already exists/.test(String(e))) throw e;
				const cohorts = (await client.query(api.esl.cohorts.list, {
					year: key.year,
					grade: key.grade,
					status: 'all'
				})) as { _id: string; level: string; classNumber: string }[];
				const existing = cohorts.find(
					(c) => c.level === key.level && c.classNumber === key.classNumber
				);
				if (!existing) throw e;
				return existing._id;
			}
		};

		const cohortAId = await ensureCohort(COHORT_A);
		const cohortBId = await ensureCohort(COHORT_B);
		const clilA = await clilClassOf(client, cohortAId);
		const clilB = await clilClassOf(client, cohortBId);
		classAId = clilA._id;
		classBId = clilB._id;

		if (ownedCohorts < 2) {
			// Adopted residue: snapshot whatever the classes held.
			for (const clil of [clilA, clilB]) {
				adopted.push({
					classId: clil._id,
					teacherId: (clil.teacherId as string | null | undefined) ?? null,
					room: (clil.room as string | null | undefined) ?? null,
					meetings: await meetingsOf(client, clil._id, YEAR)
				});
			}
		}

		const staff = (await client.query(api.esl.staff.list, {})) as {
			_id: string;
			name: string;
			eslRole: string | null;
		}[];
		// A teacher with no classes yet, so the seeded weeks are the whole load
		// and no other slot can refuse the seed.
		let teacher = null;
		for (const candidate of staff.filter((s) => s.eslRole === 'teacher').slice(0, 20)) {
			const existing = await client.query(api.esl.classes.listByTeacher, {
				teacherId: candidate._id as never
			});
			if (existing.length === 0) {
				teacher = candidate;
				break;
			}
		}
		teacher ??= staff.find((s) => s.eslRole === 'teacher') ?? staff[0] ?? null;
		if (!teacher) throw new Error('No ESL staff to block');
		teacherName = teacher.name;
		teacherId = teacher._id;

		// Snapshot this teacher's blocks before touching them.
		adoptedBlocks = await blocksOf(client, teacher._id, YEAR);
		await client.mutation(api.esl.availability.setBlocks, {
			teacherId: teacher._id as never,
			year: YEAR,
			blocks: []
		});

		await client.mutation(api.esl.classes.assignTeacher, {
			id: classAId as never,
			teacherId: teacher._id as never
		});
		await client.mutation(api.esl.classes.setSchedule, {
			classId: classAId as never,
			year: YEAR,
			meetings: [...C1_MEETINGS]
		});
		await client.mutation(api.esl.classes.setSchedule, {
			classId: classBId as never,
			year: YEAR,
			meetings: [...C2_MEETINGS]
		});
	});

	test.afterAll(async () => {
		useRole('esladmin');
		const client = authedClient();
		// The profile dialog writes untagged rows, so clear them explicitly;
		// the tagged cohorts go through the tag cleanup.
		await client.mutation(api.esl.availability.setBlocks, {
			teacherId: teacherId as never,
			year: YEAR,
			blocks: adoptedBlocks
		});
		if (ownedCohorts === 2) {
			await cleanupByTag('esl', e2eTag);
		} else {
			for (const state of adopted) {
				// Blank clears the room, restoring the unset state when that is
				// what the adoption found; absent would leave the seeded room.
				await client.mutation(api.esl.classes.setSchedule, {
					classId: state.classId as never,
					year: YEAR,
					room: state.room ?? '',
					meetings: state.meetings
				});
				await client.mutation(api.esl.classes.assignTeacher, {
					id: state.classId as never,
					...(state.teacherId ? { teacherId: state.teacherId as never } : {})
				});
			}
		}
	});

	test('profile NA block shows in the picker and refuses the conflicting save', async ({
		page
	}) => {
		// 1. Block Monday P1 with a note, through the profile dialog.
		await page.goto(`/esl/admin/users/${teacherId}`);
		await page.waitForSelector('body.hydrated');
		await page.getByTestId('esl-admin-user-profile.year').selectOption(YEAR);
		await expect(page.getByRole('heading', { name: teacherName })).toBeVisible();

		await page.getByTestId('esl-admin-user-profile.availability.trigger').click();
		await expect(page.getByTestId('esl-admin-user-profile.availability.dialog')).toBeVisible();
		await page
			.locator(
				'[data-testid="esl-admin-user-profile.availability.cell"][aria-label="Mo P1 available"]'
			)
			.click();
		await page.getByTestId('esl-admin-user-profile.availability.note').fill(BLOCK_NOTE);
		await page.getByTestId('esl-admin-user-profile.availability.save').click();

		await expect(page.getByTestId('esl-admin-user-profile.notice')).toContainText(
			`Availability saved for ${YEAR}: 1 blocked period`
		);
		await expect(page.getByTestId('esl-admin-user-profile.availability.dialog')).toHaveCount(0);

		// 2. The class timetable picker reads the fresh block as NA.
		await page.goto('/esl/admin/classes');
		await page.waitForSelector('body.hydrated');
		await page.getByTestId('esl-admin-classes.filter.year').selectOption(YEAR);
		await page.getByTestId('esl-admin-classes.filter.grade').selectOption('7');

		const cardA = page.getByTestId(`esl-admin-classes.card.${classAId}`);
		await expect(cardA).toBeVisible();
		await cardA.getByTestId('esl-admin-classes.schedule.toggle').click();
		await expect(cardA.getByTestId('esl-admin-classes.schedule.editor')).toBeVisible();

		// Row-major grid: index 0 is P1/Monday, the blocked slot.
		const blockedCell = cardA.getByTestId('esl-admin-classes.schedule.cell').nth(0);
		await expect(blockedCell).toHaveText('NA');
		await expect.poll(async () => blockedCell.getAttribute('title')).toContain(BLOCK_NOTE);

		// 3. Drafting the blocked slot is refused before it can be saved.
		await blockedCell.click();
		await expect(cardA.getByTestId('esl-admin-classes.schedule.impact')).toContainText(
			'Mo P1 - unavailable'
		);
		await expect(cardA.getByTestId('esl-admin-classes.schedule.save')).toBeDisabled();

		// 4. Assigning the teacher into the blocked slot is refused, quoting the note.
		const cardB = page.getByTestId(`esl-admin-classes.card.${classBId}`);
		await expect(cardB).toBeVisible();
		await cardB.getByTestId(`esl-admin-classes.teacher.${classBId}`).selectOption(teacherId);
		await expect(page.getByTestId('esl-admin-classes.error')).toContainText(BLOCK_NOTE);
	});
});
