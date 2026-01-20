import { mutation } from './_generated/server';
import { authComponent } from './auth';

export const resetDatabase = mutation({
	args: {},
	handler: async (ctx) => {
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});

		// Get all Better Auth users
		const adapterUsers = await adapter.findMany({ model: 'user', where: [] });

		// Delete test users (@hwis.test emails)
		let deletedUsers = 0;
		for (const user of adapterUsers as any[]) {
			if (user.email && (user.email.includes('hwis.test') || user.email.includes('test'))) {
				await adapter.deleteMany({
					model: 'session',
					where: [{ field: 'userId', value: user.id }]
				});
				await adapter.deleteMany({
					model: 'account',
					where: [{ field: 'userId', value: user.id }]
				});
				await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: user.id }] });
				deletedUsers++;
			}
		}

		// Delete all Convex users table entries except real accounts
		const allUsers = await ctx.db.query('users').collect();
		let deletedConvexUsers = 0;
		for (const user of allUsers) {
			const existingUser = (adapterUsers as any[]).find((u) => u.id === user.authId);
			if (!existingUser) {
				await ctx.db.delete(user._id);
				deletedConvexUsers++;
			}
		}

		// Delete all students
		const students = await ctx.db.query('students').collect();
		for (const s of students) {
			await ctx.db.delete(s._id);
		}

		// Delete all evaluations
		const evaluations = await ctx.db.query('evaluations').collect();
		for (const e of evaluations) {
			await ctx.db.delete(e._id);
		}

		// Delete all audit logs
		const auditLogs = await ctx.db.query('audit_logs').collect();
		for (const a of auditLogs) {
			await ctx.db.delete(a._id);
		}

		// Re-seed default categories
		const categories = [
			{ name: 'Academic Excellence', subCategories: ['Homework', 'Test', 'Quiz'] },
			{ name: 'Participation', subCategories: ['Class Discussion', 'Group Work'] },
			{ name: 'Behavior', subCategories: [] },
			{ name: 'Creativity', subCategories: ['Art', 'Music'] }
		];
		for (const cat of categories) {
			await ctx.db.insert('point_categories', {
				name: cat.name,
				subCategories: cat.subCategories
			});
		}

		// Re-seed default students
		const defaultStudents = [
			{
				englishName: 'Alice Smith',
				chineseName: '史艾莉',
				studentId: 'S1001',
				grade: 9,
				status: 'Enrolled' as const
			},
			{
				englishName: 'Bob Jones',
				chineseName: '張博博',
				studentId: 'S1002',
				grade: 10,
				status: 'Enrolled' as const
			},
			{
				englishName: 'Charlie Brown',
				chineseName: '布查理',
				studentId: 'S1003',
				grade: 11,
				status: 'Enrolled' as const
			},
			{
				englishName: 'David Wilson',
				chineseName: '魏大維',
				studentId: 'S1004',
				grade: 12,
				status: 'Not Enrolled' as const
			},
			{
				englishName: 'Eve Davis',
				chineseName: '戴伊芙',
				studentId: 'S1005',
				grade: 9,
				status: 'Not Enrolled' as const
			}
		];
		for (const student of defaultStudents) {
			await ctx.db.insert('students', { ...student, note: '' });
		}

		return {
			message: 'Database reset complete',
			deletedUsers,
			deletedConvexUsers,
			categoriesSeeded: categories.length,
			studentsSeeded: defaultStudents.length
		};
	}
});
