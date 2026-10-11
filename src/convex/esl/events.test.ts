import { describe, expect, it, afterEach, vi } from 'vitest';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';

const YEAR = '2025-2026';

async function seededSemester() {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
	const semesterId = await t.mutation(api.esl.semesters.create, {
		year: YEAR,
		term: 'S1',
		startDate: '2025-08-31'
	});
	return { t, semesterId };
}

describe('esl/events.create', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates a ranged task event with a default All target', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'Passport check',
			date: '2025-09-17',
			endDate: '2025-09-24'
		});
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({
			type: 'task',
			title: 'Passport check',
			target: 'all',
			date: '2025-09-17',
			endDate: '2025-09-24'
		});
	});

	it('refuses a range on a single-date type', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_school',
				title: 'Off',
				note: 'Typhoon day',
				date: '2025-09-25',
				endDate: '2025-09-26'
			})
		).rejects.toThrow(/range/i);
	});

	it('refuses a free-text title on a locked type', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_school',
				title: 'Typhoon day',
				date: '2025-09-25'
			})
		).rejects.toThrow(/always shows "Off"/);
	});

	it('refuses a blank task title', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'task',
				title: '   ',
				date: '2025-09-25'
			})
		).rejects.toThrow(/title/i);
	});

	it('refuses an exam title outside the locked three', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'exam',
				title: 'Midterm',
				date: '2025-10-16'
			})
		).rejects.toThrow(/Exam 1/);
	});

	it('refuses another event on a no-school day', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_school',
			title: 'Off',
			note: 'Typhoon day',
			date: '2025-09-25'
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_class',
				title: 'No class',
				note: 'Assembly',
				date: '2025-09-25'
			})
		).rejects.toThrow();
	});

	it('refuses another event on an exam day', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'task',
				title: 'Passport check',
				date: '2025-10-16'
			})
		).rejects.toThrow();
	});

	it('refuses a second partial on one date', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'partial',
			title: 'No class',
			note: 'BBQ',
			date: '2025-09-12',
			startPeriod: 3
		});
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'partial',
				title: 'No class',
				note: 'Late start',
				date: '2025-09-12',
				endPeriod: 2
			})
		).rejects.toThrow(/partial/i);
	});

	it('refuses out-of-range partial periods', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'partial',
				title: 'No class',
				note: 'Late start',
				date: '2025-09-12',
				startPeriod: 9
			})
		).rejects.toThrow(/period/i);
	});

	it('refuses partial bounds on a non-partial type', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_class',
				title: 'No class',
				note: 'Assembly',
				date: '2025-09-12',
				startPeriod: 3
			})
		).rejects.toThrow(/partial/i);
	});

	it.each([
		['start_school', 'Start at P3', '2025-09-01'],
		['quiz', 'Quiz', '2025-09-02'],
		['exam', 'Exam 1', '2025-10-16'],
		['passport_due', 'Passport due', '2025-09-03'],
		['recording_due', 'Recording due', '2025-09-04'],
		['g9_mock', 'G9 Mock Exam', '2025-09-05']
	] as const)('ignores the note for banner-only type %s', async (type, title, date) => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type,
			title,
			note: 'should be dropped',
			date
		});
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event.note).toBeUndefined();
	});
});

describe('esl/events.update', () => {
	it('edits a seeded row in place (title, date, note)', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: "Sport's Day setup",
			date: '2025-10-24'
		});
		await t.mutation(api.esl.events.update, {
			eventId,
			title: "Sport's Day setup (moved)",
			date: '2025-10-31',
			note: "No Sport's Day in 2027 — delete instead"
		});
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({
			title: "Sport's Day setup (moved)",
			date: '2025-10-31',
			note: "No Sport's Day in 2027 — delete instead"
		});
	});

	it('refuses a title change off the locked value', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			title: 'No class',
			note: "Sport's Day",
			date: '2025-10-24'
		});
		await expect(
			t.mutation(api.esl.events.update, { eventId, title: "Sport's Day" })
		).rejects.toThrow(/always shows "No class"/);
	});

	it('moves an exam (exams stay editable while protected from deletion)', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Final Exam',
			date: '2026-01-20'
		});
		await t.mutation(api.esl.events.update, { eventId, date: '2026-01-21' });
		const semester = await t.query(api.esl.semesters.get, { semesterId });
		expect(semester?.derivedEnd).toBe('2026-01-21');
	});

	it('refuses a move onto a no-school day', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_school',
			title: 'Off',
			note: 'Typhoon day',
			date: '2025-09-25'
		});
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			title: 'No class',
			note: 'Assembly',
			date: '2025-09-26'
		});
		await expect(
			t.mutation(api.esl.events.update, { eventId, date: '2025-09-25' })
		).rejects.toThrow(/exclusive/);
	});

	it('refuses a second partial on one date via update', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'partial',
			title: 'No class',
			note: 'BBQ',
			date: '2025-09-12',
			startPeriod: 3
		});
		const otherId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'partial',
			title: 'No class',
			note: 'Late start',
			date: '2025-09-13'
		});
		await expect(
			t.mutation(api.esl.events.update, { eventId: otherId, date: '2025-09-12' })
		).rejects.toThrow(/partial/i);
	});

	it('refuses updates from non-admin staff', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			title: 'No class',
			note: "Sport's Day",
			date: '2025-10-24'
		});
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(t.mutation(api.esl.events.update, { eventId, note: 'Changed' })).rejects.toThrow(
			/ESL admin/
		);
	});

	it('ignores the note on update for a banner-only type', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		await t.mutation(api.esl.events.update, { eventId, note: 'should be dropped' });
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event.note).toBeUndefined();
	});

	it('clears the note when an update retargets a row to a banner-only type', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'Passport check',
			note: 'Unit 3',
			date: '2025-09-17'
		});
		await t.mutation(api.esl.events.update, { eventId, type: 'quiz', title: 'Quiz' });
		const event = await t.query(api.esl.events.get, { eventId });
		expect(event).toMatchObject({ type: 'quiz' });
		expect(event.note).toBeUndefined();
	});
});

describe('esl/events.remove', () => {
	it("deletes a deletable seeded row (Sport's Day, dues, makeups)", async () => {
		const { t, semesterId } = await seededSemester();
		const sportsId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			title: 'No class',
			note: "Sport's Day",
			date: '2025-10-24'
		});
		await t.mutation(api.esl.events.remove, { eventId: sportsId });
		await expect(t.query(api.esl.events.get, { eventId: sportsId })).rejects.toThrow(
			/Event not found/
		);
	});

	it('refuses to delete an exam row', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'exam',
			title: 'Exam 1',
			date: '2025-10-16'
		});
		await expect(t.mutation(api.esl.events.remove, { eventId })).rejects.toThrow(
			/protected|Exam 1/i
		);
	});

	it('refuses to delete the graduation ceremony', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			target: 'G9',
			title: 'No class',
			note: 'Graduation ceremony',
			date: '2026-06-19'
		});
		await expect(t.mutation(api.esl.events.remove, { eventId })).rejects.toThrow(
			/protected|ceremony/i
		);
	});

	it('refuses deletion from non-admin staff', async () => {
		const { t, semesterId } = await seededSemester();
		const eventId = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_class',
			title: 'No class',
			note: "Sport's Day",
			date: '2025-10-24'
		});
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(t.mutation(api.esl.events.remove, { eventId })).rejects.toThrow(/ESL admin/);
	});
});

describe('esl/events.migrateToV3', () => {
	it('reports zero migrated rows on a v3 database (idempotent)', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'task',
			title: 'Passport check',
			date: '2025-09-17'
		});
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'no_school',
			title: 'Off',
			note: 'Typhoon day',
			date: '2025-09-25'
		});
		const report = await t.mutation(api.esl.events.migrateToV3, {});
		expect(report).toMatchObject({ total: 2, migrated: 0, skipped: [] });
	});

	it('refuses migration from non-admin staff', async () => {
		const { t } = await seededSemester();
		await seedEslStaff(t, { authId: 'esl-teacher', eslRole: 'teacher' });
		await expect(t.mutation(api.esl.events.migrateToV3, {})).rejects.toThrow(/ESL admin/);
	});
});
