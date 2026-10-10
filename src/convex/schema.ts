import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	users: defineTable({
		authId: v.optional(v.string()),
		name: v.optional(v.string()),
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'))),
		/**
		 * Per-department staff assignment. Absent on legacy rows, which fall back
		 * to `{ international: role }` through `resolveDepartmentRoles`. Super
		 * users keep universal access whatever this field holds.
		 */
		departmentRoles: v.optional(
			v.object({
				international: v.optional(v.union(v.literal('admin'), v.literal('teacher'))),
				esl: v.optional(v.union(v.literal('admin'), v.literal('teacher')))
			})
		),
		/** Registration timestamp (ms) — set once when the profile is created. */
		createdAt: v.optional(v.number()),
		/** Set when an active user's access is removed (status -> 'pending'); cleared on restore. */
		deactivatedAt: v.optional(v.number()),
		e2eTag: v.optional(v.string())
	})
		.index('by_authId', ['authId'])
		.index('by_e2eTag', ['e2eTag']),

	sessions: defineTable({
		userId: v.id('users'),
		token: v.string(),
		expiresAt: v.number(),
		ipAddress: v.optional(v.string()),
		userAgent: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('token', ['token']),
	/**
	 * Heartbeat written by a successful Drive backup, read by the freshness
	 * watchdog and the admin banner.
	 *
	 * The watchdog deliberately reads this table rather than listing the Drive
	 * folder. A check that needed the Drive credential would fail for the same
	 * reason the backup failed — an expired refresh token — and could not tell
	 * "the archive is stale" from "I cannot see anything". Reading our own table
	 * keeps detection working exactly when Drive is what is broken.
	 *
	 * Rows are appended, not upserted, so the table doubles as a record of which
	 * nights actually succeeded. They are small and there is one per night, so
	 * no pruning is scheduled; revisit if the deployment ever needs to retain
	 * this table through a long-lived restore drill.
	 */
	backupHeartbeats: defineTable({
		completedAt: v.number(),
		filename: v.string(),
		environment: v.string(),
		fileId: v.optional(v.string())
	})
		.index('by_completedAt', ['completedAt'])
		.index('by_environment', ['environment']),

	accounts: defineTable({
		userId: v.id('users'),
		accountId: v.string(),
		providerId: v.string(),
		accessToken: v.optional(v.string()),
		refreshToken: v.optional(v.string()),
		idToken: v.optional(v.string()),
		expiresAt: v.optional(v.number()),
		password: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('provider_account', ['providerId', 'accountId']),

	verifications: defineTable({
		identifier: v.string(),
		value: v.string(),
		expiresAt: v.number(),
		createdAt: v.number()
	}),

	classes: defineTable({
		grade: v.number(),
		class: v.string(),
		homeroomTeacherId: v.optional(v.id('users')),
		e2eTag: v.optional(v.string())
	})
		.index('by_grade_class', ['grade', 'class'])
		.index('by_teacher', ['homeroomTeacherId'])
		.index('by_e2eTag', ['e2eTag']),

	students: defineTable({
		englishName: v.string(),
		chineseName: v.string(),
		studentId: v.string(),
		classId: v.id('classes'),
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		note: v.optional(v.string()),
		e2eTag: v.optional(v.string()),
		house: v.optional(
			v.union(v.literal('Heracles'), v.literal('Wukong'), v.literal('Ixbalam'), v.literal('Setna'))
		)
	})
		.index('by_studentId', ['studentId'])
		.index('by_classId', ['classId'])
		.index('by_status', ['status'])
		.index('by_e2eTag', ['e2eTag'])
		.index('by_house', ['house'])
		.index('by_status_classId', ['status', 'classId'])
		.index('by_status_house', ['status', 'house']),

	audit_logs: defineTable({
		action: v.string(),
		performerId: v.id('users'),
		targetTable: v.string(),
		targetId: v.string(),
		oldValue: v.optional(v.any()),
		newValue: v.optional(v.any()),
		timestamp: v.number(),
		e2eTag: v.optional(v.string())
	})
		.index('by_timestamp', ['timestamp'])
		.index('by_performerId', ['performerId'])
		.index('by_target', ['targetTable', 'targetId'])
		.index('by_e2eTag', ['e2eTag']),

	point_categories: defineTable({
		name: v.string(),
		meritCriteria: v.optional(v.array(v.string())),
		demeritCriteria: v.optional(v.array(v.string())),
		casAlignment: v.optional(
			v.array(v.union(v.literal('Creativity'), v.literal('Activity'), v.literal('Service')))
		),
		e2eTag: v.optional(v.string())
	}).index('by_e2eTag', ['e2eTag']),

	evaluations: defineTable({
		studentId: v.id('students'),
		teacherId: v.id('users'),
		value: v.number(),
		categoryId: v.id('point_categories'),
		details: v.string(),
		timestamp: v.number(),
		semesterId: v.string(),
		// Groups evaluations awarded together in one call. Rows created before
		// this column existed fall back to a derived key on the client.
		batchId: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	})
		.index('by_studentId', ['studentId'])
		.index('by_studentId_teacherId', ['studentId', 'teacherId'])
		.index('by_teacherId', ['teacherId'])
		.index('by_timestamp', ['timestamp'])
		.index('by_categoryId', ['categoryId'])
		.index('by_e2eTag', ['e2eTag']),

	backups: defineTable({
		name: v.optional(v.string()),
		filename: v.string(),
		creatorId: v.optional(v.id('users')),
		creatorName: v.optional(v.string()),
		creatorRole: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		source: v.optional(
			v.union(
				v.literal('manual'),
				v.literal('system_migration'),
				v.literal('system_safety'),
				v.literal('system_cron')
			)
		),
		data: v.optional(v.any()),
		chunkCount: v.optional(v.number()),
		studentsCount: v.optional(v.number()),
		createdAt: v.number(),
		e2eTag: v.optional(v.string())
	})
		.index('by_createdAt', ['createdAt'])
		.index('by_creatorId', ['creatorId'])
		.index('by_e2eTag', ['e2eTag']),

	backup_chunks: defineTable({
		backupId: v.id('backups'),
		chunkIndex: v.number(),
		data: v.string()
	})
		.index('by_backupId', ['backupId'])
		.index('by_backupId_chunkIndex', ['backupId', 'chunkIndex']),

	settings: defineTable({
		key: v.string(),
		value: v.string(),
		updatedAt: v.number(),
		updatedBy: v.optional(v.id('users'))
	}).index('by_key', ['key']),

	/**
	 * Admin-only board preview screenshots. Deliberately a separate table from
	 * `settings`: the live TV boards subscribe to `settings['leaderboard.<board>']`
	 * for their enabled/theme flags, so base64 screenshots must never live in that
	 * row — reading them on every board load (and on every capture write) burned
	 * most of the free-tier database I/O budget. See ADR-0019.
	 */
	leaderboard_thumbnails: defineTable({
		board: v.union(v.literal('houses'), v.literal('classes')),
		theme: v.union(
			v.literal('default'),
			v.literal('thanksgiving-1'),
			v.literal('thanksgiving-2'),
			v.literal('christmas'),
			v.literal('cny'),
			v.literal('halloween')
		),
		url: v.string(),
		updatedAt: v.number()
	})
		.index('by_board_theme', ['board', 'theme'])
		.index('by_board', ['board']),

	/**
	 * Precomputed leaderboard stats, refreshed by cron (ADR-0020). The public
	 * boards used to call fetchHouseStats/fetchClassStats on every page load,
	 * which full-scanned `evaluations` each time and burned the free-tier
	 * database I/O budget. Boards now subscribe to the precomputed snapshot
	 * instead; the cron recomputes only when evaluations actually changed.
	 */
	leaderboard_snapshots: defineTable({
		board: v.union(v.literal('houses'), v.literal('classes')),
		stats: v.string(), // JSON payload mirroring the live fetch*Stats return shape
		generatedAt: v.number(),
		watermark: v.number() // max evaluations.timestamp seen at last refresh
	}).index('by_board', ['board']),

	house_events: defineTable({
		title: v.string(),
		startDate: v.number(),
		endDate: v.number(),
		housePoints: v.optional(
			v.object({
				Heracles: v.optional(v.number()),
				Wukong: v.optional(v.number()),
				Ixbalam: v.optional(v.number()),
				Setna: v.optional(v.number())
			})
		),
		e2eTag: v.optional(v.string())
	})
		.index('by_startDate', ['startDate'])
		.index('by_e2eTag', ['e2eTag']),

	// ---------------------------------------------------------------------
	// ESL department (bounded context, isolated from International)
	// ---------------------------------------------------------------------
	// ESL students have no houses, no CAS tags and no point evaluations, so
	// they live in their own tables rather than in the International
	// `students`/`classes`/`evaluations` graph (ADR-0012).

	/**
	 * A student cohort: the group of ESL students who move through the
	 * programme together. Cohorts own the roster (`esl_students`) and the
	 * classes that teach them (`esl_classes`).
	 *
	 * A cohort is shared by two classes that draw the same roster: G7/G8 by
	 * their CLIL and Comm classes, G10 by the A and B sections of one base
	 * class (H101 → H101A, H101B). G9 is taught by a single class. Sharing is
	 * what `esl/classes.getRoster` relies on.
	 *
	 * Levelled grades identify a cohort by level + number; grade 10 is not
	 * levelled and identifies it by base-class number alone, so its `level`
	 * is absent.
	 */
	esl_cohorts: defineTable({
		/** School year in `YYYY-YYYY` form, e.g. `2025-2026`. */
		year: v.string(),
		/** Grade the cohort belongs to (7-10). */
		grade: v.number(),
		/**
		 * Ability level within the grade. Absent for grade 10, which is not
		 * levelled — its cohorts are the base classes H101…H110, split into
		 * A/B sections rather than ability bands.
		 */
		level: v.optional(v.string()),
		/**
		 * Cohort number within its grade: `1`/`2` for the levelled grades, and a
		 * base-class number for grade 10 — however many the school runs that
		 * year, so this is not a fixed set. Stored zero-padded for grade 10 so
		 * that lexical comparison orders it numerically.
		 */
		classNumber: v.string(),
		/**
		 * Set only by end-to-end runs, so a test's cohorts can be removed
		 * afterwards on the same tag pattern the other tables use. Absent in
		 * every real import.
		 */
		e2eTag: v.optional(v.string()),

		/** `archived` cohorts are read-only history; only `active` accepts new students. */
		status: v.union(v.literal('active'), v.literal('archived')),
		createdAt: v.number()
	})
		.index('by_year', ['year'])
		.index('by_year_grade', ['year', 'grade'])
		.index('by_status', ['status'])
		.index('by_year_grade_level_classNumber', ['year', 'grade', 'level', 'classNumber'])
		.index('by_e2eTag', ['e2eTag']),

	/**
	 * A class that teaches a cohort. G7/G8 cohorts are shared by their `CLIL`
	 * and `Comm` classes and G10 cohorts by their `H10A`/`H10B` sections — both
	 * halves point at the same cohort, so they share one roster. A `G9` cohort
	 * is taught by a single class.
	 */
	esl_classes: defineTable({
		cohortId: v.id('esl_cohorts'),
		type: v.union(
			v.literal('CLIL'),
			v.literal('Comm'),
			v.literal('G9'),
			v.literal('H10A'),
			v.literal('H10B')
		),
		name: v.string(),
		teacherId: v.optional(v.id('users')),
		/**
		 * The department room this class meets in, for all of its days.
		 *
		 * One room per class rather than one per meeting: ADR-0027 considered and
		 * rejected a class that moves rooms mid-week, so if that ever changes this
		 * field moves onto `esl_class_meetings` and the ADR is amended.
		 *
		 * Optional because a room is genuinely undecidable until the year's
		 * timetable exists — `cohorts.create` writes no room, so a freshly
		 * imported year starts unscheduled and unroomed.
		 */
		room: v.optional(v.string()),
		/** `archived` classes are kept for history but hidden from active lists. */
		status: v.union(v.literal('active'), v.literal('archived')),
		createdAt: v.number()
	})
		.index('by_cohortId', ['cohortId'])
		.index('by_teacherId', ['teacherId']),

	/**
	 * One weekly meeting of an ESL class: the day and period it meets.
	 *
	 * Meetings are rows rather than an array on the class because conflict
	 * detection needs them indexed, and a meeting is a genuine fact with its own
	 * identity — it is what a clash is *about* (ADR-0027). Convex cannot index
	 * into an array, so an inline array would full-scan in the teacher-timetable
	 * query on every subscription push.
	 *
	 * Three rows per G7/G8 `CLIL` class and two per everything else, across a few
	 * hundred classes a year, so the table is small.
	 */
	esl_class_meetings: defineTable({
		classId: v.id('esl_classes'),
		/**
		 * The class's school year, e.g. `2025-2026`.
		 *
		 * Stored rather than derived — ADR-0027's one named exception. A meeting's
		 * year is two joins away (meeting → class → cohort → year), and the
		 * conflict check needs every meeting in a year indexed by
		 * `(year, day, period)`, which an index without a stored year cannot
		 * serve. It cannot drift: a meeting's class is never repointed, and
		 * `advanceGrade` creates new rows rather than moving existing ones.
		 */
		year: v.string(),
		/** Monday to Friday. A day carries at most one ESL period. */
		day: v.union(
			v.literal('Monday'),
			v.literal('Tuesday'),
			v.literal('Wednesday'),
			v.literal('Thursday'),
			v.literal('Friday')
		),
		/** Period number, 1–8, against the school's bell schedule. */
		period: v.number(),
		/**
		 * Copied from the class's cohort at write time, so end-to-end teardown is
		 * one indexed read rather than a per-meeting hop through class and cohort.
		 * Absent in every real write. Cannot drift, for the same reason `year`
		 * cannot: a meeting's class is never repointed.
		 */
		e2eTag: v.optional(v.string())
	})
		.index('by_classId', ['classId'])
		.index('by_year_day_period', ['year', 'day', 'period'])
		.index('by_e2eTag', ['e2eTag']),

	/**
	 * A `(day, period)` a teacher cannot teach.
	 *
	 * **Blocked slots, not available ones.** Availability is the default, so a
	 * teacher with no rows is available everywhere — which is the correct state for
	 * every teacher until someone says otherwise, and cannot be wrong by omission.
	 * The alternative would need a row per teacher per slot (35 a year), where a
	 * missing row would silently mean "unavailable".
	 *
	 * Per year, because availability follows a timetable: next year's part-time load
	 * is not this year's.
	 *
	 * No class on the row. Availability is a property of the *person*, so it holds
	 * whether or not any class is assigned to them yet — which is what lets the
	 * scheduler refuse a slot before a timetable exists.
	 */
	esl_teacher_availability: defineTable({
		teacherId: v.id('users'),
		/** The school year the block applies to, e.g. `2025-2026`. */
		year: v.string(),
		/** Monday to Friday, as on a meeting. */
		day: v.union(
			v.literal('Monday'),
			v.literal('Tuesday'),
			v.literal('Wednesday'),
			v.literal('Thursday'),
			v.literal('Friday')
		),
		/** Period number, 1–8, against the school's bell schedule. */
		period: v.number(),
		/**
		 * Optional free text, so an admin can say *why* — "lunch duty", "part-time".
		 * The rule does not read it; it is for the human reading the picker.
		 */
		note: v.optional(v.string()),
		/**
		 * Copied from the same tag scheme as every other ESL table, so end-to-end
		 * teardown stays one indexed read.
		 */
		e2eTag: v.optional(v.string())
	})
		.index('by_teacher_year', ['teacherId', 'year'])
		.index('by_year', ['year'])
		.index('by_e2eTag', ['e2eTag']),

	/**
	 * A semester term: S1 or S2 of a school year.
	 *
	 * Explicit startDate only — the end is derived at read time as the max
	 * date of exam-type events (null until the first final is entered, when
	 * views clamp to startDate..today). Pass dates as YYYY-MM-DD strings;
	 * never take wall-clock reads in queries (pre-existing schoolYearOf
	 * local-vs-Taipei drift is out of scope and must not widen).
	 */
	esl_semesters: defineTable({
		/** School year in `YYYY-YYYY` form, e.g. `2025-2026`. */
		year: v.string(),
		/** Which half of the year. */
		term: v.union(v.literal('S1'), v.literal('S2')),
		/** First day of the term, `YYYY-MM-DD`. */
		startDate: v.string(),
		/**
		 * Set only by end-to-end runs, so a test's semesters can be removed
		 * afterwards on the same tag pattern the other tables use. Absent in
		 * every real write.
		 */
		e2eTag: v.optional(v.string())
	})
		.index('by_year_term', ['year', 'term'])
		.index('by_e2eTag', ['e2eTag']),

	/**
	 * A typed school event inside a semester: off vs no-class vs partial vs
	 * exam vs dues, each with the schedule effect the teacher views assume.
	 */
	esl_events: defineTable({
		semesterId: v.id('esl_semesters'),
		type: v.union(
			v.literal('task_due'),
			v.literal('homework_due'),
			v.literal('quiz'),
			v.literal('off'),
			v.literal('no_class'),
			v.literal('partial'),
			v.literal('exam'),
			v.literal('start_school')
		),
		/** Display label, e.g. `Exam 1`, `Final exam`, `Passport check`. */
		label: v.string(),
		/**
		 * Which classes this event affects. `all` reaches every teacher;
		 * G10 has no target of its own and sees `all` events only.
		 */
		target: v.union(v.literal('all'), v.literal('CLIL'), v.literal('Comm'), v.literal('G9')),
		/** The date (`YYYY-MM-DD`), or the range start for due-types. */
		date: v.string(),
		/**
		 * Inclusive range end, due-types only (task/homework/quiz reminder
		 * ranges). Absent on every single-date type.
		 */
		endDate: v.optional(v.string()),
		/** Free-form note, e.g. BBQ logistics or collection reminders. */
		note: v.optional(v.string()),
		/**
		 * Partial-day bounds: meetings before startPeriod / after endPeriod
		 * are out-of-window. Partials only, each optional, validated 1–8.
		 */
		startPeriod: v.optional(v.number()),
		endPeriod: v.optional(v.number()),
		/**
		 * Lunar provenance: how a seeded Moon Festival / Dragon Boat date was
		 * resolved (`holiday_api` vs `admin_typed`), and whether the
		 * admin-typed fallback is still unverified.
		 */
		provenance: v.optional(v.union(v.literal('holiday_api'), v.literal('admin_typed'))),
		unverified: v.optional(v.boolean()),
		/**
		 * Set only by end-to-end runs, on the same tag pattern as every other
		 * ESL table, so teardown stays one indexed read.
		 */
		e2eTag: v.optional(v.string())
	})
		.index('by_semester', ['semesterId'])
		.index('by_semester_date', ['semesterId', 'date'])
		.index('by_e2eTag', ['e2eTag']),

	/**
	 * A teacher's private per-meeting note, keyed by class and date: free
	 * text for progress/prep/history, last-write-wins, no history, no edit
	 * cutoff. The read gate is strictly the assigned teacher — no staff, no
	 * admin, no covering teacher, no override path — so the gate lives in
	 * `esl/notes` (assigned-teacher match), not in `requireEslStaff`.
	 *
	 * Surfaces on the calendar only, never the list. Pass dates as
	 * `YYYY-MM-DD` strings, like every other ESL table.
	 */
	teacher_notes: defineTable({
		/** The class the note belongs to. */
		classId: v.id('esl_classes'),
		/** The meeting date (`YYYY-MM-DD`) the note is about. */
		date: v.string(),
		/** The owning teacher: the class's assigned teacher at write time. */
		teacherId: v.id('users'),
		/** The note text. */
		text: v.string(),
		/** Wall-clock millis of the last write. */
		updatedAt: v.number(),
		/** Who last wrote (always the owner, by the gate). */
		updatedBy: v.id('users'),
		/**
		 * Set only by end-to-end runs, on the same tag pattern as every other
		 * ESL table, so teardown stays one indexed read.
		 */
		e2eTag: v.optional(v.string())
	})
		.index('by_class_teacher_date', ['classId', 'teacherId', 'date'])
		.index('by_teacher', ['teacherId'])
		.index('by_e2eTag', ['e2eTag']),

	/**
	 * An ESL student, enrolled into exactly one cohort. Transfer status is
	 * tracked in place (`active` ⇄ `disabled` with a reason) rather than by
	 * moving rows between cohorts, so the history of a cohort stays stable.
	 */
	esl_students: defineTable({
		cohortId: v.id('esl_cohorts'),
		/**
		 * Absent when the student has no English name yet.
		 *
		 * A G7 intake arrives before the English names are filled in, and the
		 * workbook's column is empty for a whole grade. Requiring one would mean
		 * refusing the September import or inventing a name, so the column is
		 * optional and the name is added afterwards. Manual entry through
		 * `esl/students` still requires one, because there a human is typing it.
		 */
		englishName: v.optional(v.string()),
		chineseName: v.string(),
		/** School student ID — 6 or 7 digits. */
		schoolStudentId: v.string(),
		/**
		 * The student's Chinese homeroom, as the two-digit class number only —
		 * `01` in a grade 7 cohort is `J101`.
		 *
		 * The `J1`/`J2`/`J3`/`H1` marker is derivable from the cohort's grade, so
		 * it is rebuilt by `chineseClassCode` on read rather than stored
		 * redundantly against a rule the school can change (ADR-0025).
		 *
		 * Optional, and required everywhere a value is actually known: the roster
		 * import refuses a file with no Chinese-class column and rejects a blank
		 * cell, and manual entry demands one. The only rows that may lack it are
		 * those `advanceGrade` creates, because next year's homeroom number is the
		 * Chinese department's September decision and is unknowable when a year is
		 * carried forward. Grade 10 has no such path — `advancementTargetGrade`
		 * returns null for grades 9 and 10 — so the apply enforces presence there.
		 */
		chineseClass: v.optional(v.string()),
		status: v.union(v.literal('active'), v.literal('disabled')),
		enrolledAt: v.number(),
		disabledAt: v.optional(v.number()),
		/** Why the student is disabled (required when disabling). */
		statusReason: v.optional(v.string()),
		/**
		 * Set only by end-to-end runs, so a test's roster can be removed
		 * afterwards on the same tag pattern the other tables use. Absent in
		 * every real import.
		 */
		e2eTag: v.optional(v.string())
	})
		.index('by_cohortId', ['cohortId'])
		.index('by_cohortId_schoolStudentId', ['cohortId', 'schoolStudentId'])
		.index('by_schoolStudentId', ['schoolStudentId'])
		.index('by_status', ['status'])
		.index('by_e2eTag', ['e2eTag'])
});
