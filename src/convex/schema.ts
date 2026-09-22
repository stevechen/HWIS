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
		.index('by_e2eTag', ['e2eTag'])
});
