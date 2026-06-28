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
		studentRecordId: v.optional(v.id('students')),
		e2eTag: v.optional(v.string())
	})
		.index('by_authId', ['authId'])
		.index('by_studentRecordId', ['studentRecordId']),

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
		homeroomTeacherId: v.optional(v.id('users'))
	})
		.index('by_grade_class', ['grade', 'class'])
		.index('by_teacher', ['homeroomTeacherId']),

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
		.index('by_house', ['house']),

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
		e2eTag: v.optional(v.string())
	})
		.index('by_studentId', ['studentId'])
		.index('by_studentId_teacherId', ['studentId', 'teacherId'])
		.index('by_teacherId', ['teacherId'])
		.index('by_timestamp', ['timestamp'])
		.index('by_categoryId', ['categoryId'])
		.index('by_e2eTag', ['e2eTag']),

	backups: defineTable({
		filename: v.string(),
		data: v.any(),
		createdAt: v.number()
	}).index('by_createdAt', ['createdAt']),

	settings: defineTable({
		key: v.string(),
		value: v.string(),
		updatedAt: v.number(),
		updatedBy: v.id('users')
	}).index('by_key', ['key']),

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
	}).index('by_startDate', ['startDate'])
});
