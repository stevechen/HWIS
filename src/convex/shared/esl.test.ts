import { describe, it, expect } from 'vitest';
import {
	buildTeacherDayRows,
	type ScheduleMeetingInput,
	type ScheduleEventInput,
	EslEventType
} from './esl';

describe('shared/esl - buildTeacherDayRows exam labels', () => {
	const MEETINGS: ScheduleMeetingInput[] = [
		{ classId: 'class_1', type: 'CLIL', cohortGrade: 7, day: 'Monday', period: 1 },
		{ classId: 'class_1', type: 'CLIL', cohortGrade: 7, day: 'Wednesday', period: 2 },
		{ classId: 'class_1', type: 'CLIL', cohortGrade: 7, day: 'Friday', period: 3 }
	];

	const createEvents = (examLabels: string[]): ScheduleEventInput[] => {
		const events: ScheduleEventInput[] = [];
		// Use weekdays: 2025-09-15 (Mon), 2025-09-29 (Mon), 2025-10-13 (Mon)
		const baseDates = ['2025-09-15', '2025-09-29', '2025-10-13'];
		examLabels.forEach((label, index) => {
			events.push({
				type: 'exam' as EslEventType,
				label,
				target: 'all',
				date: baseDates[index]
			});
		});
		return events;
	};

	it('uses exam event labels as-is for countdown label', () => {
		const events = createEvents(['Exam 1', 'Exam 2', 'Final Exam']);
		const rows = buildTeacherDayRows({
			meetings: MEETINGS,
			events,
			semesterStart: '2025-09-01',
			semesterEnd: '2025-12-15',
			term: 'S1',
			fromDate: '2025-09-01',
			toDate: '2025-12-15'
		});

		// Find exam rows
		const examRows = rows.filter((r) => r.status === 'exam');
		expect(examRows.length).toBe(3);

		// Each exam row should have count with the exam label
		expect(examRows[0].count).toEqual({ position: 1, total: 1, label: 'Exam 1' });
		expect(examRows[1].count).toEqual({ position: 1, total: 1, label: 'Exam 2' });
		expect(examRows[2].count).toEqual({ position: 1, total: 1, label: 'Final Exam' });
	});

	it('teaching rows count toward the next exam with correct label', () => {
		const events = createEvents(['Exam 1', 'Exam 2', 'Final Exam']);
		const rows = buildTeacherDayRows({
			meetings: MEETINGS,
			events,
			semesterStart: '2025-09-01',
			semesterEnd: '2025-12-15',
			term: 'S1',
			fromDate: '2025-09-01',
			toDate: '2025-12-15'
		});

		// Teaching rows before Exam 1 should count toward Exam 1
		const teachingBeforeExam1 = rows.filter(
			(r) => r.status === 'teaching' && r.date < '2025-09-15'
		);
		for (const row of teachingBeforeExam1) {
			expect(row.count?.label).toBe('Exam 1');
		}

		// Teaching rows between Exam 1 and Exam 2 should count toward Exam 2
		const teachingBetweenExams = rows.filter(
			(r) => r.status === 'teaching' && r.date > '2025-09-15' && r.date < '2025-09-29'
		);
		for (const row of teachingBetweenExams) {
			expect(row.count?.label).toBe('Exam 2');
		}

		// Teaching rows between Exam 2 and Final Exam should count toward Final Exam
		const teachingBeforeFinal = rows.filter(
			(r) => r.status === 'teaching' && r.date > '2025-09-29' && r.date < '2025-10-13'
		);
		for (const row of teachingBeforeFinal) {
			expect(row.count?.label).toBe('Final Exam');
		}

		// Teaching rows after Final Exam should have null count
		const teachingAfterFinal = rows.filter((r) => r.status === 'teaching' && r.date > '2025-10-13');
		for (const row of teachingAfterFinal) {
			expect(row.count).toBeNull();
		}
	});

	it('resets count at each exam boundary', () => {
		const events = createEvents(['Exam 1', 'Exam 2', 'Final Exam']);
		const rows = buildTeacherDayRows({
			meetings: MEETINGS,
			events,
			semesterStart: '2025-09-01',
			semesterEnd: '2025-12-15',
			term: 'S1',
			fromDate: '2025-09-01',
			toDate: '2025-12-15'
		});

		// First teaching day should be position 1
		const firstTeaching = rows.find((r) => r.status === 'teaching' && r.date === '2025-09-01');
		expect(firstTeaching?.count?.position).toBe(1);

		// Last teaching day before Exam 1 should have position = total for that block
		const lastBeforeExam1 = rows
			.filter((r) => r.status === 'teaching' && r.date < '2025-09-15')
			.sort((a, b) => b.date.localeCompare(a.date))[0];
		expect(lastBeforeExam1?.count?.position).toBe(lastBeforeExam1?.count?.total);

		// First teaching day after Exam 1 should reset to position 1
		const firstAfterExam1 = rows
			.filter((r) => r.status === 'teaching' && r.date > '2025-09-15')
			.sort((a, b) => a.date.localeCompare(b.date))[0];
		expect(firstAfterExam1?.count?.position).toBe(1);
	});

	it('off, no_class, exam rows have null count', () => {
		const events: ScheduleEventInput[] = [
			{ type: 'off', label: 'Moon Festival', target: 'all', date: '2025-09-05' },
			{ type: 'no_class', label: "Sport's Day", target: 'all', date: '2025-09-08' },
			{ type: 'exam', label: 'Exam 1', target: 'all', date: '2025-09-15' }
		];
		const rows = buildTeacherDayRows({
			meetings: MEETINGS,
			events,
			semesterStart: '2025-09-01',
			semesterEnd: '2025-09-15',
			term: 'S1',
			fromDate: '2025-09-01',
			toDate: '2025-09-15'
		});

		const offRow = rows.find((r) => r.status === 'off');
		expect(offRow?.count).toBeNull();

		const noClassRow = rows.find((r) => r.status === 'no_class');
		expect(noClassRow?.count).toBeNull();

		const examRow = rows.find((r) => r.status === 'exam');
		expect(examRow?.count).toEqual({ position: 1, total: 1, label: 'Exam 1' });
	});
});
