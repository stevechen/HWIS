import { describe, expect, it } from 'vite-plus/test';
import { convexTest, modules, seedEslStaff } from '../test.setup';
import { api } from '../_generated/api';
import schema from '../schema';
import {
	ESL_EVENT_TYPES,
	ESL_REMINDER_KINDS,
	isEslReminderKind,
	migrateToReminderEslEvent,
	type EslReminderKind
} from '../shared/esl';

const YEAR = '2025-2026';

async function seededSemester() {
	const t = await convexTest(schema, modules);
	await seedEslStaff(t, { authId: 'esl-admin', eslRole: 'admin' });
	const semesterId = await t.mutation(api.esl.semesters.create, {
		year: YEAR,
		term: 'S1',
		startDate: '2025-08-31',
		eslRoomLimit: 'D'
	});
	return { t, semesterId };
}

describe('reminder schema migration (#216)', () => {
	it('exposes reminder and drops quiz/passport_due/recording_due/task', () => {
		expect([...ESL_EVENT_TYPES]).toContain('reminder');
		expect([...ESL_EVENT_TYPES]).not.toContain('quiz');
		expect([...ESL_EVENT_TYPES]).not.toContain('passport_due');
		expect([...ESL_EVENT_TYPES]).not.toContain('recording_due');
		expect([...ESL_EVENT_TYPES]).not.toContain('task');
	});

	it('exposes the six reminder kinds', () => {
		expect([...ESL_REMINDER_KINDS].sort()).toEqual(
			['passport', 'passport_check', 'quiz', 'recording', 'task', 'workbook_check'].sort()
		);
		expect(isEslReminderKind('quiz')).toBe(true);
		expect(isEslReminderKind('bogus')).toBe(false);
	});

	it.each([
		['quiz', 'Unit 1 Quiz Due', 'CLIL'],
		['passport', 'Passport due', 'Comm'],
		['recording', 'Recording due', 'Comm'],
		['task', 'Passport Unit 3 due', 'all'],
		['passport_check', 'Passport check', 'Comm'],
		['workbook_check', 'Workbook check', 'CLIL']
	] as const)('creates a reminder of kind %s', async (kind, title, target) => {
		const { t, semesterId } = await seededSemester();
		const created = await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'reminder',
			reminderKind: kind,
			title,
			target,
			date: '2025-09-17',
			endDate: '2025-09-24'
		});
		if (Array.isArray(created)) throw new Error('reminder create fanned out');
		const event = await t.query(api.esl.events.get, { eventId: created });
		expect(event).toMatchObject({
			type: 'reminder',
			reminderKind: kind,
			title,
			target,
			isBanner: true
		});
	});

	it('refuses a reminder without a kind', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'reminder',
				title: 'Unit 1 Quiz Due',
				date: '2025-09-17'
			})
		).rejects.toThrow(/reminderKind|kind/i);
	});

	it('refuses a kind on a non-reminder type', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'no_class',
				title: 'No class',
				note: 'Assembly',
				date: '2025-09-17',
				reminderKind: 'quiz' as EslReminderKind
			})
		).rejects.toThrow(/reminder/i);
	});

	it('refuses a mistargeted reminder kind (quiz outside CLIL)', async () => {
		const { t, semesterId } = await seededSemester();
		await expect(
			t.mutation(api.esl.events.create, {
				semesterId,
				type: 'reminder',
				reminderKind: 'quiz',
				title: 'Unit 1 Quiz Due',
				target: 'Comm',
				date: '2025-09-17'
			})
		).rejects.toThrow(/CLIL/);
	});

	it('maps legacy quiz/passport/recording/task rows to reminders (pure)', () => {
		// NOTE: convex-test enforces the schema, so a legacy-typed row is
		// uninsertable by construction (same limit as the `hasTitle` guard
		// note in events.test.ts). The mapping is proven pure here; the
		// mutation applier is proven idempotent below.
		expect(migrateToReminderEslEvent({ type: 'quiz', title: 'Unit 1 Quiz Due' })).toMatchObject({
			type: 'reminder',
			reminderKind: 'quiz',
			title: 'Unit 1 Quiz Due',
			isBanner: true
		});
		expect(
			migrateToReminderEslEvent({ type: 'passport_due', title: 'Passport due' })
		).toMatchObject({
			type: 'reminder',
			reminderKind: 'passport',
			title: 'Passport due',
			isBanner: true
		});
		expect(
			migrateToReminderEslEvent({ type: 'recording_due', title: 'Recording due' })
		).toMatchObject({ type: 'reminder', reminderKind: 'recording', isBanner: true });
		expect(migrateToReminderEslEvent({ type: 'task', title: 'Workbook p.42' })).toMatchObject({
			type: 'reminder',
			reminderKind: 'task',
			title: 'Workbook p.42',
			isBanner: true
		});
		expect(migrateToReminderEslEvent({ type: 'exam', title: 'Exam 1' })).toBeNull();
	});

	it('migrateToReminder is idempotent on a migrated database', async () => {
		const { t, semesterId } = await seededSemester();
		await t.mutation(api.esl.events.create, {
			semesterId,
			type: 'reminder',
			reminderKind: 'quiz',
			title: 'Unit 1 Quiz Due',
			target: 'CLIL',
			date: '2025-09-02',
			endDate: '2025-09-09'
		});
		const report = await t.mutation(api.esl.events.migrateToReminder, {});
		expect(report).toMatchObject({ migrated: 0 });
		const events = await t.query(api.esl.events.listBySemester, { semesterId });
		expect(events.filter((e) => e.type === 'reminder')).toHaveLength(1);
	});
});
