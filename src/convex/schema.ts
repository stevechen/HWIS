import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	users: defineTable({
		authId: v.optional(v.string()),
		name: v.optional(v.string()),
		role: v.optional(
			v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'), v.literal('student'))
		),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'), v.literal('deactivated')))
	}).index('by_authId', ['authId']),

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
		createdAt: v.number(),
		updatedAt: v.number()
	}),

	students: defineTable({
		englishName: v.string(),
		chineseName: v.string(),
		studentId: v.string(),
		grade: v.number(),
		status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
		note: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	})
		.index('by_studentId', ['studentId'])
		.index('by_grade', ['grade'])
		.index('by_status', ['status']),

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
		.index('by_target', ['targetTable', 'targetId']),

	point_categories: defineTable({
		name: v.string(),
		subCategories: v.array(v.string()),
		e2eTag: v.optional(v.string())
	}),

	evaluations: defineTable({
		studentId: v.id('students'),
		teacherId: v.id('users'),
		value: v.number(),
		category: v.string(),
		subCategory: v.string(),
		details: v.string(),
		timestamp: v.number(),
		semesterId: v.string(),
		e2eTag: v.optional(v.string())
	})
		.index('by_studentId', ['studentId'])
		.index('by_teacherId', ['teacherId'])
		.index('by_timestamp', ['timestamp']),

	backups: defineTable({
		filename: v.string(),
		data: v.any(),
		createdAt: v.number()
	}).index('by_createdAt', ['createdAt'])
});
